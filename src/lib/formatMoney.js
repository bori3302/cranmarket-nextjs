// filepath: src/lib/formatMoney.js
export const centsToDollars = (cents) => (cents / 100).toFixed(2);
export const dollarsToCents = (dollars) => Math.round(Number(dollars) * 100);

