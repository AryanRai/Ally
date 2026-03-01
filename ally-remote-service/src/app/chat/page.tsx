'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

/**
 * /chat route — redirects authenticated users to the glass-pip-chat web app
 * served from /app/index.html. Unauthenticated users go back to login.
 */
export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/');
    } else {
      // Redirect to the glass-pip-chat web app
      window.location.href = '/app/index.html';
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg" />
      <p className="ml-4 text-muted-foreground">Loading Ally Chat...</p>
    </div>
  );
}
