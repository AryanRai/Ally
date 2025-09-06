'use client'

import { SimpleChatInterface } from '@/components/SimpleChatInterface'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { AuthForm } from '@/components/AuthForm'
import { UserProfile } from '@/components/UserProfile'
import { useAuth } from '@/contexts/AuthContext'
import { Zap, Wifi } from 'lucide-react'

export default function Home() {
  const { user, loading, signOut } = useAuth()

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    )
  }

  // Show auth form if not authenticated
  if (!user) {
    return <AuthForm onAuthSuccess={() => {}} />
  }

  // Show main chat interface if authenticated
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header with connection status and user profile */}
      <header className="glass-subtle border-b border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Ally Remote Chat</h1>
              <p className="text-xs text-gray-400">Unified Integration v2.0</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 glass-subtle px-3 py-1 rounded-full">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-300">Connected</span>
            </div>
            <ConnectionStatus />
            <UserProfile user={user} onSignOut={signOut} />
          </div>
        </div>
      </header>

      {/* Main chat interface */}
      <div className="flex-1 flex flex-col">
        <SimpleChatInterface />
      </div>
    </main>
  )
}