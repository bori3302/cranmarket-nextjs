'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Plus, Check, X, Trophy, Clock, DollarSign, LogOut } from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  deleteDoc,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import Link from 'next/link';

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
      usersList.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      setAllUsers(usersList);
    });

    return () => {
      unsubscribeMarkets();
      unsubscribePending();
      unsubscribeUsers();
    };
  }, []);

  const loadUserFromStorage = () => {
    const savedUser = localStorage.getItem('cranmarket-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
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

  const MarketCard = ({ market }) => {
    const yesPrice = (market.yesShares || 0) / ((market.yesShares || 0) + (market.noShares || 0) || 1);
    const noPrice = 1 - yesPrice;
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
                ${(market.volume || 0).toFixed(0)} volume
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
              Resolved: {market.outcome?.toUpperCase()}
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

        <div className="flex gap-2">
          <Link href={`/markets/${market.id}`} className="flex-1 text-center py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
            View Market
          </Link>
          <button
            onClick={async () => {
              // Quick share/copy link
              await navigator.clipboard.writeText(`${location.origin}/markets/${market.id}`);
              alert('Market link copied to clipboard');
            }}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Share
          </button>
        </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
            <input
              type="text"
              placeholder="Will Student A get into Harvard?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              placeholder="Additional context about the market..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Closing Date (Optional)</label>
            <input
              type="datetime-local"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {!user.isAdmin && (
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">Your market will be submitted for admin approval before going live.</p>
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
        <div className="text-center py-12 text-gray-500">No pending markets to review</div>
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
              }`}>{i + 1}</div>
              <span className="font-medium text-gray-900">{u.email.split('@')[0]}</span>
            </div>
            <span className="font-bold text-green-600">${(u.balance || 0).toFixed(2)}</span>
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
                  <div className="text-lg font-bold text-green-600">${(user.balance || 0).toFixed(2)}</div>
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
              <div className="text-center py-12 text-gray-500">No markets yet. Be the first to create one!</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {markets.map(market => <MarketCard key={market.id} market={market} />)}
              </div>
            )}
          </div>
        )}

        {view === 'create' && <CreateMarketForm />}
        {view === 'admin' && user.isAdmin && <AdminPanel />}
        {view === 'leaderboard' && <Leaderboard />}
      </div>
      {showAuthModal && <AuthModal />}
    </div>
  );
}