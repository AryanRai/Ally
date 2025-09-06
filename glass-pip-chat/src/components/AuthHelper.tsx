/**
 * Authentication Helper Component
 * 
 * Provides easy authentication setup for development and testing
 */

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { env } from '../utils/env';

export const AuthHelper: React.FC = () => {
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('test123456');
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const handleSignUp = async () => {
    setIsLoading(true);
    setResult('Creating account...');

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        setResult(`❌ Sign up failed: ${error.message}`);
      } else {
        setResult(`✅ Account created! User ID: ${data.user?.id}\n📧 Check your email to confirm (or use sign in if already confirmed)`);
      }
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    setResult('Signing in...');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setResult(`❌ Sign in failed: ${error.message}`);
      } else {
        setResult(`✅ Signed in successfully! User ID: ${data.user?.id}\n🎉 You can now use remote mode!`);
      }
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setResult('Testing database connection...');

    try {
      const { data, error } = await supabase
        .from('local_systems')
        .select('*')
        .limit(1);

      if (error) {
        setResult(`❌ Database test failed: ${error.message}`);
      } else {
        setResult(`✅ Database connection successful!\nFound ${data?.length || 0} systems`);
      }
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg space-y-4">
      <h3 className="text-white font-bold">Authentication Helper</h3>
      
      <div className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSignUp}
          disabled={isLoading}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Sign Up
        </button>
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Sign In
        </button>
        <button
          onClick={handleTestConnection}
          disabled={isLoading}
          className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          Test DB
        </button>
      </div>

      {result && (
        <div className="p-3 bg-gray-700 rounded">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">{result}</pre>
        </div>
      )}

      <div className="text-xs text-gray-400">
        <p><strong>Quick Setup:</strong></p>
        <p>1. Use the default credentials or enter your own</p>
        <p>2. Click "Sign Up" to create an account</p>
        <p>3. Click "Sign In" to authenticate</p>
        <p>4. Use "Test DB" to verify database connection</p>
      </div>
    </div>
  );
};