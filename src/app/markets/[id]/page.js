'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { usePathname } from 'next/navigation';

export default function MarketPage() {
  const pathname = usePathname();
  const marketId = pathname?.split('/').pop();
  const [market, setMarket] = useState(null);
  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState('yes');
  const [tradeType, setTradeType] = useState('buy');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('cranmarket-user');
    if (saved) {
      // avoid sync setState in effect which may trigger cascading renders
      setTimeout(() => setUser(JSON.parse(saved)), 0);
    }
  }, []);

  useEffect(() => {
    if (!marketId) return;
    const marketRef = doc(db, 'markets', marketId);
    const unsub = onSnapshot(marketRef, (snap) => {
      if (snap.exists()) setMarket({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [marketId]);

  const handlePlaceOrder = async () => {
    if (!user) { alert('Please login first'); return; }
    const value = Number(amount);
    if (!value || value <= 0) return;

    try {
      const body = {
        userId: user.id,
        type: tradeType, // buy or sell
        position, // yes or no
        amount: value,
      };

      const res = await fetch(`/api/markets/${marketId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        alert('Order failed: ' + (err?.message || res.statusText));
        return;
      }

      const data = await res.json();
      // Update local user state from returned user doc if present
      if (data.user) {
        setUser(data.user);
        localStorage.setItem('cranmarket-user', JSON.stringify(data.user));
      }

      setAmount('');
      alert('Order placed successfully');
    } catch (e) {
      console.error(e);
      alert('Network error placing order');
    }
  };

  if (loading) return <div className="p-8">Loading market...</div>;
  if (!market) return <div className="p-8">Market not found</div>;

  const yesPrice = (market.yesShares || 0) / ((market.yesShares || 0) + (market.noShares || 0) || 1);
  const noPrice = 1 - yesPrice;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-2xl font-bold mb-2">{market.question}</h1>
        <p className="text-sm text-gray-600 mb-4">{market.description}</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-green-50 rounded-lg border border-green-100">
            <div className="text-sm text-gray-600">YES</div>
            <div className="text-3xl font-bold text-green-600">{(yesPrice * 100).toFixed(1)}¢</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-100">
            <div className="text-sm text-gray-600">NO</div>
            <div className="text-3xl font-bold text-red-600">{(noPrice * 100).toFixed(1)}¢</div>
          </div>
        </div>

        {!market.resolved && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setTradeType('buy')} className={`flex-1 py-2 rounded-lg ${tradeType === 'buy' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Buy</button>
              <button onClick={() => setTradeType('sell')} className={`flex-1 py-2 rounded-lg ${tradeType === 'sell' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Sell</button>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setPosition('yes')} className={`flex-1 py-2 rounded-lg ${position === 'yes' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>YES</button>
              <button onClick={() => setPosition('no')} className={`flex-1 py-2 rounded-lg ${position === 'no' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>NO</button>
            </div>

            <div className="flex gap-2">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in dollars" className="flex-1 px-4 py-2 border rounded-lg" />
              <button onClick={handlePlaceOrder} className="px-6 py-2 bg-blue-600 text-white rounded-lg">Place Order</button>
            </div>
          </div>
        )}

        {market.resolved && (
          <div className={`mt-4 p-3 rounded-lg ${market.outcome === 'yes' ? 'bg-green-50' : 'bg-red-50'}`}>
            Resolved: {market.outcome?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}
