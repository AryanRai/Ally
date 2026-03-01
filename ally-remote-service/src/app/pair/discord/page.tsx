'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

function DiscordPairContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const discordId = searchParams.get('discord_id');
  const discordName = searchParams.get('discord_name');

  const [status, setStatus] = useState<'auth' | 'linking' | 'success' | 'error'>('auth');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token || !discordId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-xl font-bold text-red-500">Invalid Link</p>
          <p className="text-sm text-gray-400 mt-2">
            Use the /link command in Discord to get a valid pairing link.
          </p>
        </div>
      </div>
    );
  }

  const handleSignInAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      );

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) { setError(authError.message); setLoading(false); return; }
      if (!authData.user) { setError('Authentication failed'); setLoading(false); return; }

      setStatus('linking');

      const res = await fetch('/api/discord/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.session?.access_token}`,
        },
        body: JSON.stringify({
          token, discord_user_id: discordId,
          discord_username: discordName || 'Unknown', user_id: authData.user.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to link'); setStatus('error'); setLoading(false); return;
      }
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Something went wrong'); setStatus('error');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Link Discord to Ally</h1>
          <p className="text-gray-400 mt-2">
            Linking as <span className="text-indigo-400 font-medium">{discordName || discordId}</span>
          </p>
        </div>

        {status === 'auth' && (
          <form onSubmit={handleSignInAndLink} className="space-y-4">
            <p className="text-sm text-gray-400 text-center mb-4">Sign in to your Ally account to complete the link</p>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50">
              {loading ? 'Linking...' : 'Sign In & Link Discord'}
            </button>
          </form>
        )}

        {status === 'linking' && (
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-gray-300">Linking your accounts...</p>
          </div>
        )}

        {status === 'success' && (
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-bold text-green-500">Linked Successfully</p>
            <p className="text-sm text-gray-400 mt-2">Use <code className="text-indigo-400">/chat</code> in Discord to talk to Ally.</p>
            <p className="text-xs text-gray-500 mt-4">You can close this tab.</p>
          </motion.div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-xl font-bold text-red-500">Link Failed</p>
            <p className="text-sm text-gray-400 mt-2">{error}</p>
            <button onClick={() => { setStatus('auth'); setError(''); }}
              className="mt-4 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors">
              Try Again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function DiscordPairPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    }>
      <DiscordPairContent />
    </Suspense>
  );
}
