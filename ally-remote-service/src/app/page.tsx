'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/auth/AuthForm';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AllyLogo } from '@/components/ui/ally-logo';
import { SystemStatus } from '@/components/system/SystemStatus';
import { motion } from 'framer-motion';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user && mounted) {
      router.push('/chat');
    }
  }, [user, router, mounted]);

  if (loading || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="ml-4 text-muted-foreground">Redirecting to chat...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/50 dark:bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AllyLogo size="sm" />
              <div>
                <h1 className="text-xl font-bold">Ally Remote</h1>
                <p className="text-sm text-muted-foreground">AI Assistant Control Panel</p>
              </div>
            </div>
            <SystemStatus />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <AllyLogo size="lg" className="mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-2">Welcome to Ally Remote</h2>
            <p className="text-muted-foreground mb-6">
              Connect to your local AI assistant from anywhere. 
              Sign in to start controlling your Ally system remotely.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <AuthForm />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-8 text-center text-sm text-muted-foreground"
          >
            <p>
              Make sure your local Ally system is running and connected to the internet.
            </p>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/50 dark:bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              Ally Remote v1.0.0 - Part of the DroidCore robotics platform
            </p>
            <p className="mt-1">
              Powered by Next.js, Supabase, and Vercel
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}