/**
 * WebAuthGate
 *
 * In web mode, wraps the app and requires Supabase authentication
 * before showing the chat UI. Shows a simple sign-in form.
 */

import { useState, useEffect, ReactNode } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '../utils/supabase';
import { User } from '@supabase/supabase-js';

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

  const handleSignOut = async () => {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (!isSupabaseEnabled()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p>Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  // Sign-in / sign-up form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-1">Ally</h1>
          <p className="text-gray-400 text-sm">
            {isSignUp ? 'Create an account' : 'Sign in to your assistant'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none text-white placeholder-gray-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none text-white placeholder-gray-500"
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

        <p className="text-center text-sm text-gray-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
            className="text-blue-400 hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
