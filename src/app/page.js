'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Plus, Check, X, Trophy, Clock, DollarSign, LogOut } from 'lucide-react';
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
  orderBy,
  onSnapshot
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
      const unsubscribeMarkets = onSnapshot(
        collection(db, 'markets'),
        (snapshot) => {
          const marketsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setMarkets(marketsList);
        }
      );

      const unsubscribePending = onSnapshot(
        collection(db, 'pendingMarkets'),
        (snapshot) => {
          const pendingList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setPendingMarkets(pendingList);
        }
      );

      const unsubscribeUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const usersList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          usersList.sort((a, b) => b.balance - a.balance);
          setAllUsers(usersList);
        }
      );

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

  const MarketCard = ({ market }) => {
    const [amount, setAmount] = useState('');
    const [position, setPosition] = useState('yes');

    const yesPrice = market.yesShares / (market.yesShares + market.noShares);
    const noPrice = 1 - yesPrice;

    const handleTrade = async () => {
      const tradeAmount = parseFloat(amount);
      if (!tradeAmount || tradeAmount <= 0 || tradeAmount > user.balance) return;

      const price = position === 'yes' ? yesPrice : noPrice;
      const shares = tradeAmount / price;

      try {
        const marketRef = doc(db, 'markets', market.id);
        await updateDoc(marketRef, {
          yesShares: position === 'yes' ? market.yesShares + shares : market.yesShares,
          noShares: position === 'no' ? market.noShares + shares : market.noShares,
          volume: market.volume + tradeAmount
        });

        const trade = {
          marketId: market.id,
          marketQuestion: market.question,
          position,
          amount: tradeAmount,
          shares,
          price,
          timestamp: Date.now()
        };

        const userRef = doc(db, 'users', user.id);
        const updatedUser = {
          ...user,
          balance: user.balance - tradeAmount,
          trades: [...user.trades, trade]
        };

        await updateDoc(userRef, {
          balance: updatedUser.balance,
          trades: updatedUser.trades
        });

        setUser(updatedUser);
        localStorage.setItem('cranmarket-user', JSON.stringify(updatedUser));
        setAmount('');
      } catch (e) {
        console.error('Trade error:', e);
        alert('Error processing trade');
      }
    };

    const isExpired = market.closingDate && Date.now() > market.closingDate;

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
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
            <div className="flex gap-2">
              <button
                onClick={() => setPosition('yes')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  position === 'yes' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Buy YES
              </button>
              <button
                onClick={() => setPosition('no')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  position === 'no' 
                    ? 'bg-red-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Buy NO
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleTrade}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Trade
              </button>
            </div>
          </div>
        )}

        {user?.isAdmin && !market.resolved && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
            <button
              onClick={async () => {
                const marketRef = doc(db, 'markets', market.id);
                await updateDoc(marketRef, { resolved: true, outcome: 'yes' });
              }}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold"
            >
              Resolve YES
            </button>
            <button
              onClick={async () => {
                const marketRef = doc(db, 'markets', market.id);
                await updateDoc(marketRef, { resolved: true, outcome: 'no' });
              }}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
            >
              Resolve NO
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
        createdAt: Date.now()
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