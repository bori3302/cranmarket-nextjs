'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Plus, Check, X, Trophy, Clock, DollarSign, LogOut, LineChart as LineChartIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  onSnapshot,
  getDoc
} from 'firebase/firestore';

export default function CranMarket() {
  const [user, setUser] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [pendingMarkets, setPendingMarkets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState('markets');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserFromStorage();
  }, []);

  useEffect(() => {
    if (user) {
      const marketsRef = collection(db, 'markets');
      const pendingRef = collection(db, 'pendingMarkets');
      const usersRef = collection(db, 'users');

      const unsubscribeMarkets = onSnapshot(marketsRef, (snapshot) => {
        const marketsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMarkets(marketsList);
      });

      const unsubscribePending = onSnapshot(pendingRef, (snapshot) => {
        const pendingList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPendingMarkets(pendingList);
      });

      const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
        const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        usersList.sort((a, b) => b.balance - a.balance);
        setAllUsers(usersList);
      });

      return () => {
        unsubscribeMarkets();
        unsubscribePending();
        unsubscribeUsers();
      };
    }
  }, [user]);

  const loadUserFromStorage = () => {
    const savedUser = localStorage.getItem('cranmarket-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  };

  /**
   * Feature 3: Payoff logic
   */
  const handleMarketResolution = async (market, outcome) => {
    if (!user.isAdmin || market.resolved) return;

    try {
      // 1. Update market state
      const marketRef = doc(db, 'markets', market.id);
      await updateDoc(marketRef, { resolved: true, outcome: outcome });

      // 2. Calculate and distribute payoffs to all users
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        let totalWinnings = 0;
        let tradesUpdated = false;

        const updatedTrades = userData.trades.map(trade => {
          // Only process UNSETTLED BUY trades for the current market
          if (trade.marketId === market.id && !trade.settled && trade.shares > 0) { 
            
            // Check if the trade's position matches the market outcome
            if (trade.position === outcome) {
              // Winning Trade: Payout $1.00 per share
              const payout = trade.shares * 1;
              totalWinnings += payout;
              tradesUpdated = true;
              return { ...trade, settled: true, payout };
            } else {
              // Losing Trade: Payout $0.00 per share
              tradesUpdated = true;
              return { ...trade, settled: true, payout: 0 };
            }
          }
          // Return all other trades (already settled, or for other markets) unchanged
          return trade;
        });

        if (tradesUpdated) {
          const newBalance = userData.balance + totalWinnings;
          await updateDoc(doc(db, 'users', userDoc.id), {
            balance: newBalance,
            trades: updatedTrades
          });
        }
      }

      // 3. Update current user's state
      const currentUserDoc = await getDoc(doc(db, 'users', user.id));
      if (currentUserDoc.exists()) {
        const updatedUser = { id: currentUserDoc.id, ...currentUserDoc.data() };
        setUser(updatedUser);
        localStorage.setItem('cranmarket-user', JSON.stringify(updatedUser));
      }
    } catch (e) {
      console.error('Resolution error:', e);
      alert('Error resolving market');
    }
  };

  // --- Components ---

  const AuthModal = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');

    const handleAuth = async () => {
      if (!email.endsWith('@cranbrook.edu')) {
        setError('Must use @cranbrook.edu email');
        return;
      }

      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }

      if (!isLogin && password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email));
        const querySnapshot = await getDocs(q);

        if (isLogin) {
          if (querySnapshot.empty) {
            setError('Account not found. Please sign up first.');
            return;
          }
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          
          if (userData.password !== password) {
            setError('Incorrect password');
            return;
          }

          const userWithId = { id: userDoc.id, ...userData };
          setUser(userWithId);
          localStorage.setItem('cranmarket-user', JSON.stringify(userWithId));
          setShowAuthModal(false);
        } else {
          if (!querySnapshot.empty) {
            setError('Account already exists. Please login.');
            return;
          }

          const newUser = {
            email,
            password,
            balance: 10000,
            isAdmin: email.startsWith('admin@'),
            trades: [],
            createdAt: Date.now()
          };

          const docRef = await addDoc(usersRef, newUser);
          const userWithId = { id: docRef.id, ...newUser };
          setUser(userWithId);
          localStorage.setItem('cranmarket-user', JSON.stringify(userWithId));
          setShowAuthModal(false);
        }
      } catch (e) {
        console.error('Auth error:', e);
        setError('Error with authentication. Please try again.');
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {isLogin ? 'Login to CranMarket' : 'Sign Up for CranMarket'}
          </h2>
          <input
            type="email"
            placeholder="your.name@cranbrook.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {!isLogin && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          )}
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button
            onClick={handleAuth}
            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 mb-3"
          >
            {isLogin ? 'Login' : 'Sign Up'}
          </button>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setPassword('');
              setConfirmPassword('');
            }}
            className="w-full text-blue-600 hover:text-blue-700"
          >
            {isLogin ? 'Need an account? Sign up' : 'Have an account? Login'}
          </button>
        </div>
      </div>
    );
  };
  
  const PriceTimeline = ({ history }) => {
    // 1. Format the data for Recharts
    const chartData = history.map((point, index) => ({
        // Use the index as a simpler way to represent time for basic display
        // or format the timestamp for better x-axis labels
        time: index + 1, 
        // Convert to percentage for better display (0 to 100)
        'Yes Price': (point.yesPrice * 100),
        'No Price': (point.noPrice * 100),
        timestamp: point.timestamp, // Keep the raw timestamp for tooltips
    }));

    return (
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-md font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <LineChart className="w-4 h-4" /> Price History
        </h4>
        
        {/* Use a fixed height for the chart container */}
        <div className="w-full h-64 bg-white p-2 rounded-lg border border-gray-100">
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis 
                            dataKey="time" 
                            label={{ value: 'Trades', position: 'bottom' }} 
                            stroke="#555"
                        />
                        <YAxis 
                            domain={[0, 100]} // Price is always 0% to 100%
                            tickFormatter={(value) => `${value}¢`} 
                            stroke="#555"
                        />
                        <Tooltip 
                            formatter={(value) => [`${value.toFixed(1)}¢`, 'Price']}
                            labelFormatter={(label, payload) => {
                                // Display the timestamp in the tooltip
                                if (payload.length > 0) {
                                    return new Date(payload[0].payload.timestamp).toLocaleString();
                                }
                                return `Trade ${label}`;
                            }}
                        />
                        {/* Line for YES Price (Green) */}
                        <Line 
                            type="monotone" 
                            dataKey="Yes Price" 
                            stroke="#10B981" 
                            strokeWidth={2}
                            dot={false}
                        />
                         {/* Line for NO Price (Red) */}
                        <Line 
                            type="monotone" 
                            dataKey="No Price" 
                            stroke="#EF4444" 
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                    No price history data available yet.
                </div>
            )}
        </div>
        
        {/* Original summary remains outside the chart area */}
        <div className="mt-4 text-sm text-gray-500">
            <p>
                Data points available: **{history.length}**. Latest Price (Yes): **{(history.at(-1)?.yesPrice * 100).toFixed(1)}¢**
            </p>
        </div>
      </div>
    );
  };

  const MarketCard = ({ market }) => {
    const [amount, setAmount] = useState('');
    const [position, setPosition] = useState('yes'); // yes or no
    const [tradeType, setTradeType] = useState('buy'); // buy or sell

    const yesPrice = market.yesShares / (market.yesShares + market.noShares);
    const noPrice = 1 - yesPrice;
    const currentPrice = position === 'yes' ? yesPrice : noPrice;

    const isExpired = market.closingDate && Date.now() > market.closingDate;

    // Calculate user's net shares held for this market
    const userTradesForMarket = user?.trades.filter(t => t.marketId === market.id && !t.settled) || [];
    const userHoldings = userTradesForMarket.reduce((acc, trade) => {
        // Positive shares for buys, negative for sells
        acc[trade.position] = (acc[trade.position] || 0) + trade.shares;
        return acc;
    }, { yes: 0, no: 0 });

    const netShares = userHoldings[position] || 0;
    const maxTradeAmount = tradeType === 'buy' 
        ? user.balance 
        : netShares * currentPrice;

    /**
     * Feature 2 & 1: Sell logic and Price History update
     */
    const handleTrade = async () => {
      const tradeAmount = parseFloat(amount);
      if (!tradeAmount || tradeAmount <= 0) return;

      const sharesToTrade = tradeAmount / currentPrice;

      // 1. Validation
      if (tradeType === 'buy') {
        if (tradeAmount > user.balance) {
          alert("Insufficient balance.");
          return;
        }
      } else { // 'sell'
        if (sharesToTrade > netShares) {
          alert(`You only hold ${netShares.toFixed(2)} ${position.toUpperCase()} shares. Cannot sell ${sharesToTrade.toFixed(2)} shares for $${tradeAmount.toFixed(2)}.`);
          return;
        }
      }
      
      try {
        const marketRef = doc(db, 'markets', market.id);
        const marketUpdate = {};
        let newBalance = user.balance;
        let newTrades = [...user.trades];
        let sharesRemainingToSell = sharesToTrade;

        if (tradeType === 'buy') {
          // BUY LOGIC: Add the new trade to the list
          newBalance -= tradeAmount;
          newTrades.push({
            marketId: market.id,
            marketQuestion: market.question,
            position,
            amount: tradeAmount,
            shares: sharesToTrade, // Positive shares
            price: currentPrice,
            timestamp: Date.now(),
            settled: false,
          });
        } else {
          // SELL LOGIC: Find existing, unsettled BUY trades and reduce them (FIFO)
          newBalance += tradeAmount;
          
          // Get only the unsettled trades for this market and position, ordered by timestamp (FIFO)
          const unsettledBuyTrades = newTrades
            .filter(t => t.marketId === market.id && t.position === position && !t.settled && t.shares > 0)
            .sort((a, b) => a.timestamp - b.timestamp);

          // Iterate and close/reduce trades
          for (const trade of unsettledBuyTrades) {
            if (sharesRemainingToSell <= 0) break; // Finished selling

            const closableShares = Math.min(trade.shares, sharesRemainingToSell);
            
            // Calculate the average price of the closed position for profit/loss calculation if needed later, 
            // but for now, we just update the shares and track what's left to sell.
            
            // Reduce the shares in the existing trade
            trade.shares -= closableShares; 
            
            // Mark the trade as settled if all shares are sold
            if (trade.shares <= 0) {
              trade.settled = true;
            }
            
            sharesRemainingToSell -= closableShares;
          }
          
          // Filter out trades with 0 or negative shares that were fully settled
          newTrades = newTrades.filter(t => t.shares > 0 || !t.settled);
        }
        
        // 2. Market Update (Shares, Volume, Price History)
        marketUpdate.volume = market.volume + tradeAmount;

        if (tradeType === 'buy' || tradeType === 'sell') {
            // Recompute the total market shares after the trade is processed
            // Note: This must be done accurately based on the nature of the trade. 
            // The original logic handles market share update better at the moment.
            
            // Original logic for updating market shares:
            let newYesShares = market.yesShares;
            let newNoShares = market.noShares;
            
            if (tradeType === 'buy') {
              if (position === 'yes') newYesShares += sharesToTrade;
              else newNoShares += sharesToTrade;
            } else { // sell
              if (position === 'yes') newYesShares -= sharesToTrade;
              else newNoShares -= sharesToTrade;
            }
            
            marketUpdate.yesShares = newYesShares;
            marketUpdate.noShares = newNoShares;
            
            // Update price history
            const newPriceHistory = [...(market.priceHistory || []), {
                timestamp: Date.now(),
                yesPrice: newYesShares / (newYesShares + newNoShares),
                noPrice: newNoShares / (newYesShares + newNoShares),
            }];
            marketUpdate.priceHistory = newPriceHistory;
        }

        await updateDoc(marketRef, marketUpdate);

        // 3. User Update (Balance, Trades)
        const updatedUser = {
          ...user,
          balance: newBalance,
          trades: newTrades // Use the modified list
        };

        await updateDoc(doc(db, 'users', user.id), {
          balance: updatedUser.balance,
          trades: updatedUser.trades
        });

        // 4. Update local state
        setUser(updatedUser);
        localStorage.setItem('cranmarket-user', JSON.stringify(updatedUser));
        setAmount('');
      } catch (e) {
        console.error('Trade error:', e);
        alert('Error processing trade');
      }
    };

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
        {/* ... (Market Header and Price Display remain mostly the same) ... */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{market.question}</h3>
            <p className="text-sm text-gray-600 mb-3">{market.description}</p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                ${market.volume.toFixed(0)} volume
              </span>
              {market.closingDate && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {isExpired ? 'Closed' : new Date(market.closingDate).toLocaleDateString()}
                </span>
              )}
              {user && (
                <span className="text-blue-600 font-semibold">
                    You Hold: Yes ({userHoldings.yes.toFixed(2)}), No ({userHoldings.no.toFixed(2)})
                </span>
              )}
            </div>
          </div>
          {market.resolved && (
            <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
              market.outcome === 'yes' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              Resolved: {market.outcome.toUpperCase()}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
            <div className="text-sm text-gray-600 mb-1">YES</div>
            <div className="text-2xl font-bold text-green-600">
              {(yesPrice * 100).toFixed(1)}¢
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border-2 border-red-200">
            <div className="text-sm text-gray-600 mb-1">NO</div>
            <div className="text-2xl font-bold text-red-600">
              {(noPrice * 100).toFixed(1)}¢
            </div>
          </div>
        </div>

        {!market.resolved && !isExpired && user && (
          <div className="space-y-3">
            {/* Trade Type Switch */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                    onClick={() => setTradeType('buy')}
                    className={`flex-1 py-1 rounded-md text-sm font-semibold transition-colors ${
                        tradeType === 'buy' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                    }`}
                >
                    Buy
                </button>
                <button
                    onClick={() => setTradeType('sell')}
                    className={`flex-1 py-1 rounded-md text-sm font-semibold transition-colors ${
                        tradeType === 'sell' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                    }`}
                >
                    Sell
                </button>
            </div>
            
            {/* Position Selection */}
            <div className="flex gap-2">
              <button
                onClick={() => setPosition('yes')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  position === 'yes'
                    ? tradeType === 'buy' ? 'bg-green-600 text-white' : 'bg-green-400 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tradeType === 'buy' ? 'Buy YES' : 'Sell YES'}
              </button>
              <button
                onClick={() => setPosition('no')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  position === 'no'
                    ? tradeType === 'buy' ? 'bg-red-600 text-white' : 'bg-red-400 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tradeType === 'buy' ? 'Buy NO' : 'Sell NO'}
              </button>
            </div>
            
            {/* Amount Input and Trade Button */}
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={`Amount (Max: $${maxTradeAmount.toFixed(2)})`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleTrade}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                {tradeType === 'buy' ? 'Buy' : 'Sell'}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
                {tradeType === 'buy' 
                    ? `Cost per share: ${(currentPrice * 100).toFixed(1)}¢`
                    : `Value per share: ${(currentPrice * 100).toFixed(1)}¢`
                }
            </p>
          </div>
        )}
        
        {/* Feature 1: Price Timeline Component */}
        {market.priceHistory && <PriceTimeline history={market.priceHistory} />}
        
        {/* Feature 3: Admin Resolution Buttons */}
        {user?.isAdmin && !market.resolved && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
            <button
              onClick={() => handleMarketResolution(market, 'yes')}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold"
            >
              Resolve YES (Payoff)
            </button>
            <button
              onClick={() => handleMarketResolution(market, 'no')}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
            >
              Resolve NO (Payoff)
            </button>
          </div>
        )}
      </div>
    );
  };

  const CreateMarketForm = () => {
    const [question, setQuestion] = useState('');
    const [description, setDescription] = useState('');
    const [closingDate, setClosingDate] = useState('');

    const handleSubmit = async () => {
      if (!question || !description) return;

      const newMarket = {
        question,
        description,
        closingDate: closingDate ? new Date(closingDate).getTime() : null,
        creator: user.email,
        yesShares: 50,
        noShares: 50,
        volume: 0,
        resolved: false,
        createdAt: Date.now(),
        // Feature 1: Initialize Price History
        priceHistory: [{
            timestamp: Date.now(),
            yesPrice: 0.5,
            noPrice: 0.5,
        }]
      };

      try {
        if (user.isAdmin) {
          await addDoc(collection(db, 'markets'), newMarket);
        } else {
          await addDoc(collection(db, 'pendingMarkets'), newMarket);
        }

        setQuestion('');
        setDescription('');
        setClosingDate('');
        setView('markets');
      } catch (e) {
        console.error('Error creating market:', e);
        alert('Error creating market');
      }
    };

    return (
      <div className="max-w-2xl mx-auto bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Market</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question
            </label>
            <input
              type="text"
              placeholder="Will Student A get into Harvard?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              placeholder="Additional context about the market..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Closing Date (Optional)
            </label>
            <input
              type="datetime-local"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {!user.isAdmin && (
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              Your market will be submitted for admin approval before going live.
            </p>
          )}
          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
          >
            {user.isAdmin ? 'Create Market' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    );
  };

  const AdminPanel = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Pending Markets</h2>
      {pendingMarkets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No pending markets to review
        </div>
      ) : (
        <div className="space-y-4">
          {pendingMarkets.map(market => (
            <div key={market.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{market.question}</h3>
              <p className="text-sm text-gray-600 mb-3">{market.description}</p>
              <p className="text-xs text-gray-500 mb-4">Created by: {market.creator}</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const { id, ...marketData } = market;
                    // Initialize priceHistory for approved markets
                    if (!marketData.priceHistory) {
                        marketData.priceHistory = [{
                            timestamp: Date.now(),
                            yesPrice: 0.5,
                            noPrice: 0.5,
                        }];
                    }
                    await addDoc(collection(db, 'markets'), marketData);
                    await deleteDoc(doc(db, 'pendingMarkets', market.id));
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={async () => {
                    await deleteDoc(doc(db, 'pendingMarkets', market.id));
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const Leaderboard = () => (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Trophy className="w-6 h-6 text-yellow-500" />
        Leaderboard
      </h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {allUsers.map((u, i) => (
          <div key={u.id} className={`flex items-center justify-between p-4 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                i === 0 ? 'bg-yellow-100 text-yellow-700' :
                i === 1 ? 'bg-gray-100 text-gray-700' :
                i === 2 ? 'bg-orange-100 text-orange-700' :
                'bg-blue-50 text-blue-600'
              }`}>
                {i + 1}
              </div>
              <span className="font-medium text-gray-900">{u.email.split('@')[0]}</span>
            </div>
            <span className="font-bold text-green-600">${u.balance.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const handleLogout = () => {
    localStorage.removeItem('cranmarket-user');
    setUser(null);
    setView('markets');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-green-50 flex items-center justify-center">
        <div className="text-2xl font-bold text-gray-600">Loading CranMarket...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-green-50">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              <span className="text-green-600">Cran</span>
              <span className="text-blue-600">Market</span>
            </h1>
            <p className="text-xl text-gray-600">Prediction Market for Cranbrook</p>
          </div>
          <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg"
            >
              Get Started
            </button>
          </div>
        </div>
        {showAuthModal && <AuthModal />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-green-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              <span className="text-green-600">Cran</span>
              <span className="text-blue-600">Market</span>
            </h1>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setView('markets')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                  view === 'markets' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Markets
              </button>
              <button
                onClick={() => setView('leaderboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                  view === 'leaderboard' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Leaderboard
              </button>
              {user.isAdmin && (
                <button
                  onClick={() => setView('admin')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                    view === 'admin' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Admin
                </button>
              )}
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Create
              </button>
              <div className="flex items-center gap-4 pl-4 border-l border-gray-300">
                <div className="text-right">
                  <div className="text-sm text-gray-600">{user.email.split('@')[0]}</div>
                  <div className="text-lg font-bold text-green-600">${user.balance.toFixed(2)}</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {view === 'markets' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Active Markets</h2>
            {markets.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No markets yet. Be the first to create one!
              </div>
            ) : (
              markets.map(market => <MarketCard key={market.id} market={market} />)
            )}
          </div>
        )}

        {view === 'create' && <CreateMarketForm />}
        {view === 'admin' && user.isAdmin && <AdminPanel />}
        {view === 'leaderboard' && <Leaderboard />}
      </div>
    </div>
  );
}