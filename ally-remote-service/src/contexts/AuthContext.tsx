'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Register local system when user signs in
        if (event === 'SIGNED_IN' && session?.user) {
          await registerLocalSystem(session.user.id)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const registerLocalSystem = async (userId: string) => {
    try {
      // Generate a unique system ID based on browser/device
      const systemId = `web-${navigator.userAgent.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`
      
      const { error } = await supabase
        .from('local_systems')
        .upsert({
          id: systemId,
          user_id: userId,
          name: 'Web Interface',
          status: 'online',
          last_heartbeat: new Date().toISOString(),
          capabilities: {
            models: [],
            tools: [],
            features: ['web-interface', 'remote-chat']
          },
          metadata: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            type: 'web'
          }
        })

      if (error) {
        console.error('Error registering local system:', error)
        
        // If it's an auth error, try to refresh the session
        if (error.message.includes('JWT') || error.message.includes('expired')) {
          console.log('Attempting to refresh session due to auth error')
          const { error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError) {
            console.error('Session refresh failed:', refreshError)
          }
        }
      } else {
        console.log('Local system registered successfully:', systemId)
      }
    } catch (error) {
      console.error('Error registering local system:', error)
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  const value = {
    user,
    session,
    loading,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}