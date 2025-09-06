/**
 * Environment Test Component
 * 
 * Simple component to test that environment variables are loading correctly
 */

import React from 'react';
import { env } from '../utils/env';

export const EnvTest: React.FC = () => {
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-white font-bold mb-2">Environment Variables Test</h3>
      <div className="space-y-1 text-xs text-gray-300">
        <div>Supabase URL: {env.SUPABASE_URL ? '✅ Loaded' : '❌ Missing'}</div>
        <div>Supabase Anon Key: {env.SUPABASE_ANON_KEY ? '✅ Loaded' : '❌ Missing'}</div>
        <div>Supabase Service Key: {env.SUPABASE_SERVICE_KEY ? '✅ Loaded' : '❌ Missing'}</div>
        <div>System ID: {env.LOCAL_SYSTEM_ID}</div>
        <div>System Name: {env.LOCAL_SYSTEM_NAME}</div>
        <div>Poll Interval: {env.POLL_INTERVAL}ms</div>
      </div>
    </div>
  );
};