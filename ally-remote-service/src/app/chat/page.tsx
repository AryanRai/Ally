'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';

/**
 * /chat route — redirects to the glass-pip-chat web app.
 * Auth is handled by WebAuthGate in the web app.
 */
export default function ChatPage() {
  useEffect(() => {
    window.location.href = '/app/index.html';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="animate-pulse text-lg">Loading Ally...</div>
    </div>
  );
}
