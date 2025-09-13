'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { SystemDashboard } from '@/components/system/SystemDashboard';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AllyLogo } from '@/components/ui/ally-logo';
import { Button } from '@/components/ui/button';
import { LogOut, Settings, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ChatPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user && mounted) {
      router.push('/');
    }
  }, [user, loading, router, mounted]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (loading || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="ml-4 text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-black/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AllyLogo size="sm" />
              <div>
                <h1 className="text-lg font-bold">Ally Remote</h1>
                <p className="text-xs text-muted-foreground">
                  Connected as {user.email}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDashboard(!showDashboard)}
                className="hidden sm:flex"
              >
                <Monitor className="w-4 h-4 mr-2" />
                {showDashboard ? 'Chat' : 'Dashboard'}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {showDashboard ? (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <SystemDashboard />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <ChatInterface />
          </motion.div>
        )}
      </main>

      {/* Mobile Dashboard Toggle */}
      <div className="sm:hidden fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setShowDashboard(!showDashboard)}
          className="rounded-full w-12 h-12 shadow-lg"
        >
          <Monitor className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}