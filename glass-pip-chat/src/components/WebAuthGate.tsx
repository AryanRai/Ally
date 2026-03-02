/**
 * WebAuthGate
 *
 * In web mode, wraps the app and requires Supabase authentication
 * before showing the chat UI. Shows a polished sign-in form with
 * Google OAuth and QR pairing options.
 */

import { useState, useEffect, ReactNode } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '../utils/supabase';
import { User } from '@supabase/supabase-js';

interface Props {
  children: ReactNode;
}

/** Animated colorful blob background for glassmorphism effect */
function BlobBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="blob-1 absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-purple-600/30 blur-[80px]" />
      <div className="blob-2 absolute top-[10%] right-[-15%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-blue-500/25 blur-[80px]" />
      <div className="blob-3 absolute bottom-[-10%] left-[20%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-indigo-500/20 blur-[80px]" />
      <div className="blob-4 absolute bottom-[20%] right-[5%] w-[35vw] h-[35vw] max-w-[400px] max-h-[400px] rounded-full bg-violet-400/20 blur-[60px]" />
    </div>
  );
}

interface Props {
  children: ReactNode;
}

export function WebAuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');
  const [showQrPairing, setShowQrPairing] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      setLoading(false);
      return;
    }
    const client = getSupabaseClient();
    if (!client) { setLoading(false); return; }

    client.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const client = getSupabaseClient();
    if (!client) { setError('Supabase not configured'); return; }

    if (isSignUp) {
      const { error: err } = await client.auth.signUp({ email, password });
      if (err) setError(err.message);
      else setMessage('Check your email for a confirmation link.');
    } else {
      const { error: err } = await client.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    const client = getSupabaseClient();
    if (!client) { setError('Supabase not configured'); return; }
    setError('');
    const { error: err } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  };

  const handleQrPairing = async () => {
    if (!pairingCode.trim()) return;
    setPairingStatus('checking');
    try {
      // The pairing code is the token from the QR URL
      const res = await fetch(`/api/link?token=${pairingCode.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        setPairingStatus('error');
        setError(data.error || 'Invalid pairing code');
        return;
      }
      // Claim the token
      const claimRes = await fetch('/api/link', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pairingCode.trim() }),
      });
      if (claimRes.ok) {
        const claimData = await claimRes.json();
        localStorage.setItem('ally-paired-user-id', claimData.userId);
        localStorage.setItem('ally-paired-system', claimData.systemId);
        setPairingStatus('success');
        // Sign in with the paired user credentials if available
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setPairingStatus('error');
        setError('Failed to pair. Token may have expired.');
      }
    } catch {
      setPairingStatus('error');
      setError('Network error');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#030712] text-white overflow-hidden relative">
        <BlobBackground />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse">
            <span className="text-lg font-bold">A</span>
          </div>
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isSupabaseEnabled()) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#030712] text-white overflow-hidden relative">
        <BlobBackground />
        <p className="relative z-10 text-gray-400 text-center px-8">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#030712] text-white overflow-hidden relative">
      <BlobBackground />
      <div className="relative z-10 w-full max-w-sm space-y-6 px-4">
        {/* Glass card */}
        <div className="web-glass-bg rounded-2xl border border-white/10 p-8 shadow-2xl space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-2xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">Ally</h1>
          <p className="text-gray-500 text-sm">
            {showQrPairing ? 'Pair with your desktop' : isSignUp ? 'Create an account' : 'Sign in to your assistant'}
          </p>
        </div>

        {showQrPairing ? (
          /* QR Pairing Mode */
          <div className="space-y-4">
            <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl text-center space-y-3">
              <p className="text-sm text-gray-400">
                Open Ally on your desktop, go to Settings → Remote, and generate a QR code. Enter the pairing code below.
              </p>
              <input
                type="text"
                placeholder="Paste pairing code"
                value={pairingCode}
                onChange={e => setPairingCode(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none text-white placeholder-gray-500 text-center font-mono tracking-wider"
              />
              <button
                onClick={handleQrPairing}
                disabled={!pairingCode.trim() || pairingStatus === 'checking'}
                className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {pairingStatus === 'checking' ? 'Pairing...' : pairingStatus === 'success' ? '✓ Paired' : 'Pair Device'}
              </button>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button
              onClick={() => { setShowQrPairing(false); setError(''); setPairingStatus('idle'); }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-300"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          /* Email/Password + OAuth */
          <>
            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-600">or</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-blue-500 focus:outline-none text-white placeholder-gray-500"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-blue-500 focus:outline-none text-white placeholder-gray-500"
              />

              {error && <p className="text-red-400 text-sm">{error}</p>}
              {message && <p className="text-green-400 text-sm">{message}</p>}

              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors font-medium"
              >
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>

            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
                className="text-gray-500 hover:text-gray-300"
              >
                {isSignUp ? 'Have an account? Sign In' : 'Create account'}
              </button>
              <button
                onClick={() => { setShowQrPairing(true); setError(''); }}
                className="text-blue-400 hover:text-blue-300"
              >
                QR Pairing
              </button>
            </div>
          </>
        )}
        </div>{/* end glass card */}
      </div>
    </div>
  );
}
