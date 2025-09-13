import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ally Remote - AI Assistant Control Panel',
  description: 'Remote web interface for Ally - Unified Robot Cognitive Overlay. Control your local AI assistant from anywhere.',
  keywords: ['AI', 'assistant', 'remote', 'control', 'chat', 'LLM', 'Ally'],
  authors: [{ name: 'Ally Team' }],
  creator: 'Ally Team',
  publisher: 'Ally Team',
  robots: 'index, follow',
  viewport: 'width=device-width, initial-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_DOMAIN || 'http://localhost:3000',
    title: 'Ally Remote - AI Assistant Control Panel',
    description: 'Remote web interface for Ally - Unified Robot Cognitive Overlay',
    siteName: 'Ally Remote',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ally Remote - AI Assistant Control Panel',
    description: 'Remote web interface for Ally - Unified Robot Cognitive Overlay',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            {children}
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}