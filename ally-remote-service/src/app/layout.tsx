import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/contexts/AuthContext'
import { CompatibilityFix } from '@/components/CompatibilityFix'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ally Remote Chat',
  description: 'Remote interface for Ally AI Assistant',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f0f23',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <CompatibilityFix />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}