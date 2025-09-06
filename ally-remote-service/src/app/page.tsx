'use client'

import { ChatInterface } from '@/components/ChatInterface'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { AuthForm } from '@/components/AuthForm'
import { UserProfile } from '@/components/UserProfile'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const { user, loading } = useAuth()

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
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <h1 className="text-xl font-semibold text-white">Ally Remote Chat</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <ConnectionStatus />
            <UserProfile user={user} onSignOut={() => {}} />
          </div>
        </div>
      </header>

      {/* Main chat interface */}
      <div className="flex-1 flex flex-col">
        <ChatInterface />
      </div>
    </main>
  )
}