'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';

/**
 * Root page — immediately redirects to the glass-pip-chat web app
 * served from /app/index.html. Authentication is handled by
 * WebAuthGate inside the web app itself.
 */
export default function HomePage() {
  useEffect(() => {
    window.location.href = '/app/index.html';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="animate-pulse text-lg">Loading Ally...</div>
    </div>
  );
}
