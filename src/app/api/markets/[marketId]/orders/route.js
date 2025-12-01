import { NextResponse } from 'next/server';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  runTransaction,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { microSharesTotalCents, SHARE_SCALE } from '@/lib/matching';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {}
const db = getFirestore(app);

export async function POST(request, { params }) {
  // params may be a Promise in App Router — await it before use
  const { marketId } = await params;
  const body = await request.json();
  const { userId, type, position, amount } = body;

  if (!userId || !type || !position || !amount) {
    return NextResponse.json({ message: 'Missing fields' }, { status: 400 });
  }

  if (!['buy', 'sell'].includes(type)) return NextResponse.json({ message: 'Invalid type' }, { status: 400 });
  if (!['yes', 'no'].includes(position)) return NextResponse.json({ message: 'Invalid position' }, { status: 400 });
  const amountNum = Number(amount);
  if (!isFinite(amountNum) || amountNum <= 0) return NextResponse.json({ message: 'Invalid amount' }, { status: 400 });

  const marketRef = doc(db, 'markets', marketId);
  const userRef = doc(db, 'users', userId);
  const ordersCol = collection(db, 'markets', marketId, 'orders');
  const tradesCol = collection(db, 'markets', marketId, 'trades');

  // Determine opposite side and ordering for query
  const oppositeSide = type === 'buy' ? 'sell' : 'buy';
  const priceOrder = oppositeSide === 'sell' ? 'asc' : 'desc';

  // Build query for top opposite orders
  const makersQuery = query(
    ordersCol,
    where('position', '==', position),
    where('side', '==', oppositeSide),
    orderBy('priceCents', priceOrder),
    orderBy('createdAt', 'asc'),
    limit(20)
  );

  try {
    // Fetch maker documents (snapshot) outside the transaction; inside the transaction we'll re-read each doc by ref
    const makersSnapshot = await getDocs(makersQuery);
    const makerDocs = makersSnapshot.docs; // array of QueryDocumentSnapshot

    const result = await runTransaction(db, async (tx) => {
      const marketSnap = await tx.get(marketRef);
      const userSnap = await tx.get(userRef);
      if (!marketSnap.exists()) throw new Error('Market not found');
      if (!userSnap.exists()) throw new Error('User not found');

      const market = marketSnap.data();
      const user = userSnap.data();

      // Work in integer cents
      let remainingCents = Math.round(amountNum * 100);

      const isBuy = type === 'buy';

      const createdTrades = [];

      // Iterate makers and match as budget allows; re-read each maker doc inside transaction
      for (const makerDoc of makerDocs) {
        if (remainingCents <= 0) break;

        const makerRef = makerDoc.ref;
        const makerSnap = await tx.get(makerRef);
        if (!makerSnap.exists()) continue;
        const maker = makerSnap.data();

        const makerPrice = maker.priceCents; // cents per share
        const makerMicroAvailable = maker.microShares || 0;
        if (!makerPrice || makerMicroAvailable <= 0) continue;

        // How many microShares can taker buy/sell with remainingCents at makerPrice
        const microAffordable = Math.floor((BigInt(remainingCents) * BigInt(SHARE_SCALE)) / BigInt(makerPrice));
        const tradeMicro = Math.min(Number(microAffordable), makerMicroAvailable);
        if (tradeMicro <= 0) continue;

        const totalCents = microSharesTotalCents(tradeMicro, makerPrice);
        if (totalCents <= 0) continue;

        // Adjust balances: buyer pays, seller receives. Determine buyer/seller ids based on side
        const buyerId = isBuy ? userId : maker.userId;
        const sellerId = isBuy ? maker.userId : userId;

        // Load buyer and seller docs inside transaction
        const buyerRef = doc(db, 'users', buyerId);
        const sellerRef = doc(db, 'users', sellerId);
        const buyerSnap = buyerId === userId ? userSnap : await tx.get(buyerRef);
        const sellerSnap = sellerId === userId ? userSnap : await tx.get(sellerRef);
        const buyer = buyerSnap.data();
        const seller = sellerSnap.data();

        const buyerBalanceCents = Math.round((buyer.balance || 0) * 100);
        if (buyerBalanceCents < totalCents) {
          // buyer cannot afford this maker price; skip maker
          continue;
        }

        const newBuyerBalance = buyerBalanceCents - totalCents;
        const newSellerBalance = Math.round((seller.balance || 0) * 100) + totalCents;

        // Update maker order microShares
        const makerRemaining = makerMicroAvailable - tradeMicro;
        if (makerRemaining <= 0) {
          tx.delete(makerRef);
        } else {
          tx.update(makerRef, { microShares: makerRemaining });
        }

        // Record trade
        const tradeRecord = {
          buyerId,
          sellerId,
          microShares: tradeMicro,
          priceCents: makerPrice,
          totalCents,
          position,
          timestamp: Date.now(),
        };

        const tradeRef = doc(tradesCol);
        tx.set(tradeRef, tradeRecord);

        // Update buyer and seller docs
        const buyerTrades = [...(buyer.trades || []), { marketId, position, shares: tradeMicro / SHARE_SCALE, amount: totalCents / 100, price: makerPrice / 100, timestamp: Date.now(), settled: false }];
        tx.update(doc(db, 'users', buyerId), { balance: newBuyerBalance / 100, trades: buyerTrades });

        const sellerTrades = [...(seller.trades || []), { marketId, position, shares: -(tradeMicro / SHARE_SCALE), amount: totalCents / 100, price: makerPrice / 100, timestamp: Date.now(), settled: false }];
        tx.update(doc(db, 'users', sellerId), { balance: newSellerBalance / 100, trades: sellerTrades });

        remainingCents -= totalCents;
        createdTrades.push(tradeRecord);
      }

      // If any remaining cents, create a resting order (maker) at current market price
      if (remainingCents > 0) {
        const yesShares = market.yesShares || 0;
        const noShares = market.noShares || 0;
        const yesPrice = yesShares + noShares > 0 ? yesShares / (yesShares + noShares) : 0.5;
        const restingPriceCents = Math.max(1, Math.round((position === 'yes' ? yesPrice : (1 - yesPrice)) * 100));

        const microForRest = Math.floor((BigInt(remainingCents) * BigInt(SHARE_SCALE)) / BigInt(restingPriceCents));
        if (microForRest > 0) {
          const orderRef = doc(ordersCol);
          const order = {
            userId,
            side: type, // buy or sell
            position,
            microShares: microForRest,
            priceCents: restingPriceCents,
            createdAt: Date.now(),
          };

          const reserveCents = microSharesTotalCents(microForRest, restingPriceCents);
          if (type === 'buy') {
            const userBalanceCents = Math.round((user.balance || 0) * 100);
            if (userBalanceCents >= reserveCents) {
              tx.set(orderRef, order);
              tx.update(userRef, { balance: (userBalanceCents - reserveCents) / 100, reserved: (user.reserved || 0) + reserveCents / 100 });

              const newYes = position === 'yes' ? (market.yesShares || 0) + microForRest / SHARE_SCALE : market.yesShares || 0;
              const newNo = position === 'no' ? (market.noShares || 0) + microForRest / SHARE_SCALE : market.noShares || 0;
              tx.update(marketRef, { yesShares: newYes, noShares: newNo, volume: (market.volume || 0) + remainingCents / 100 });
            }
          } else {
            const trades = user.trades || [];
            const netShares = trades.reduce((acc, t) => (t.marketId === marketId && !t.settled ? acc + (t.shares || 0) : acc), 0);
            if ((microForRest / SHARE_SCALE) <= netShares) {
              tx.set(orderRef, order);
              const newYes = position === 'yes' ? (market.yesShares || 0) - microForRest / SHARE_SCALE : market.yesShares || 0;
              const newNo = position === 'no' ? (market.noShares || 0) - microForRest / SHARE_SCALE : market.noShares || 0;
              tx.update(marketRef, { yesShares: newYes, noShares: newNo, volume: (market.volume || 0) + remainingCents / 100 });
            }
          }
        }
      }

      return { trades: createdTrades };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error('Order error:', e);
    return NextResponse.json({ message: e.message || 'Order failed' }, { status: 500 });
  }
}
