import { microSharesTotalCents, matchTakerAgainstBook, SHARE_SCALE } from '../src/lib/matching.js';

function testMicroTotal() {
  const cents = microSharesTotalCents(500000, 75); // half share at $0.75 -> 0.5 * 75 = 37.5 cents -> floor 37
  console.log('microSharesTotalCents(500000,75) =>', cents);
}

function testMatch() {
  const taker = { id: 't1', userId: 'u1', side: 'buy', position: 'yes', microShares: 1000000 };
  const makers = [
    { id: 'm1', userId: 'u2', priceCents: 50, microShares: 500000 },
    { id: 'm2', userId: 'u3', priceCents: 60, microShares: 800000 },
  ];

  const { trades, remainingMicroShares } = matchTakerAgainstBook(taker, makers);
  console.log('trades:', trades);
  console.log('remainingMicroShares:', remainingMicroShares);
}

console.log('Running matching tests');
testMicroTotal();
testMatch();
console.log('Done');

