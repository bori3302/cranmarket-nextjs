// Pure helpers for matching orders and computing transfers in integer arithmetic.

// Use micro-shares to support fractional shares if needed.
export const SHARE_SCALE = 1_000_000; // 1 share = 1,000,000 micro-shares

// Compute total cents for given microShares and priceCentsPerShare
export function microSharesTotalCents(microShares, priceCentsPerShare) {
  // (microShares * priceCents) / SHARE_SCALE
  // use BigInt to avoid overflow and integer division truncation
  const totalBig = (BigInt(microShares) * BigInt(priceCentsPerShare)) / BigInt(SHARE_SCALE);
  return Number(totalBig);
}

// Match a single taker order against a list of maker orders (resting book).
// Taker and makers use microShares and priceCentsPerShare. This function
// returns an array of trade executions and leftover taker microShares.
export function matchTakerAgainstBook(taker, makers) {
  // taker: { id, userId, side: 'buy'|'sell', position: 'yes'|'no', microShares }
  // makers: array of { id, userId, priceCents, microShares }
  const trades = [];
  let remaining = taker.microShares;

  for (const maker of makers) {
    if (remaining <= 0) break;
    const tradeMicro = Math.min(remaining, maker.microShares);
    // Price convention: maker price (resting order price)
    const priceCents = maker.priceCents;
    const totalCents = microSharesTotalCents(tradeMicro, priceCents);

    trades.push({
      makerOrderId: maker.id,
      makerUserId: maker.userId,
      takerUserId: taker.userId,
      microShares: tradeMicro,
      priceCents,
      totalCents,
    });

    remaining -= tradeMicro;
  }

  return { trades, remainingMicroShares: remaining };
}
