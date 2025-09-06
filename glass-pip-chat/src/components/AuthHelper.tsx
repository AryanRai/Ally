/**
 * Authentication Helper Component
 * 
 * Provides easy authentication setup for development and testing
 */

import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../utils/supabase';
import { testAuthHealth, clearCorruptedAuth, recoverAuth, autoFixAuth } from '../utils/authFixer';

export const AuthHelper: React.FC = () => {
  const [email, setEmail] = useState('test@ally-demo.local');
  const [password, setPassword] = useState('demo123456');
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string>('');

  const supabase = getSupabaseClient();

  // Check auth health on component mount
  useEffect(() => {
    const checkHealth = async () => {
      const health = await testAuthHealth();
      setHealthStatus(health.success ? 
        (health.details?.authenticated ? '✅ Authenticated' : '⚪ Ready for login') :
        `❌ ${health.message}`
      );
    };
    
    checkHealth();
  }, []);

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
      const result = await recoverAuth(email, password);
      
      if (result.success) {
        setResult(`✅ ${result.message}\n${result.details?.userId ? `User ID: ${result.details.userId}` : ''}\n🎉 You can now use remote mode!`);
        
        // Update health status
        const health = await testAuthHealth();
        setHealthStatus(health.success ? 
          (health.details?.authenticated ? '✅ Authenticated' : '⚪ Ready for login') :
          `❌ ${health.message}`
        );
      } else {
        setResult(`❌ ${result.message}`);
      }
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setResult('Testing authentication health...');

    try {
      const health = await testAuthHealth();
      setResult(`${health.success ? '✅' : '❌'} ${health.message}\n${JSON.stringify(health.details, null, 2)}`);
      setHealthStatus(health.success ? 
        (health.details?.authenticated ? '✅ Authenticated' : '⚪ Ready for login') :
        `❌ ${health.message}`
      );
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoFix = async () => {
    setIsLoading(true);
    setResult('Running auto-fix...');

    try {
      const fixResult = await autoFixAuth();
      setResult(`${fixResult.success ? '✅' : '❌'} ${fixResult.message}\n${JSON.stringify(fixResult.details, null, 2)}`);
      
      // Update health status
      const health = await testAuthHealth();
      setHealthStatus(health.success ? 
        (health.details?.authenticated ? '✅ Authenticated' : '⚪ Ready for login') :
        `❌ ${health.message}`
      );
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAuth = async () => {
    setIsLoading(true);
    setResult('Clearing authentication data...');

    try {
      const clearResult = await clearCorruptedAuth();
      setResult(`${clearResult.success ? '✅' : '❌'} ${clearResult.message}`);
      
      // Update health status
      const health = await testAuthHealth();
      setHealthStatus(health.success ? 
        (health.details?.authenticated ? '✅ Authenticated' : '⚪ Ready for login') :
        `❌ ${health.message}`
      );
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-white font-bold">Authentication Helper</h3>
        <div className="text-sm px-2 py-1 rounded bg-gray-700">
          {healthStatus}
        </div>
      </div>
      
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

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleSignUp}
          disabled={isLoading}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          Sign Up
        </button>
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          Sign In
        </button>
        <button
          onClick={handleAutoFix}
          disabled={isLoading}
          className="px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm"
        >
          Auto Fix
        </button>
        <button
          onClick={handleTestConnection}
          disabled={isLoading}
          className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm"
        >
          Test Health
        </button>
        <button
          onClick={handleClearAuth}
          disabled={isLoading}
          className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm col-span-2"
        >
          Clear Auth Data
        </button>
      </div>

      {result && (
        <div className="p-3 bg-gray-700 rounded">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">{result}</pre>
        </div>
      )}

      <div className="text-xs text-gray-400">
        <p><strong>Quick Setup:</strong></p>
        <p>1. Click "Auto Fix" to resolve common issues</p>
        <p>2. Use "Sign In" to authenticate (creates account if needed)</p>
        <p>3. Use "Test Health" to verify everything works</p>
        <p>4. Use "Clear Auth Data" if you have persistent issues</p>
      </div>
    </div>
  );
};