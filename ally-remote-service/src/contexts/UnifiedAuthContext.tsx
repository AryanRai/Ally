'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getUnifiedIntegrationAdapter } from '@/services/unifiedIntegrationAdapter'
import type { User, Session } from '@supabase/supabase-js'

interface UnifiedAuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  isConnectedToGlass: boolean
  connectionStatus: string
}

const UnifiedAuthContext = createContext<UnifiedAuthContextType | undefined>(undefined)

export function UnifiedAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isConnectedToGlass, setIsConnectedToGlass] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('Checking connection...')

  const adapter = getUnifiedIntegrationAdapter()

  useEffect(() => {
    // Initialize auth state
    const initAuth = async () => {
      try {
        const authState = adapter.getAuthState()
        setUser(authState.user)
        setSession(authState.session)
        setLoading(false)
        
        if (authState.user) {
          await checkGlassConnection()
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error)
        setLoading(false)
      }
    }

    initAuth()

    // Listen for auth changes
    const unsubscribe = adapter.onAuthStateChange((authState) => {
      setUser(authState.user)
      setSession(authState.session)
      setLoading(false)
      
      if (authState.user) {
        checkGlassConnection()
      } else {
        setIsConnectedToGlass(false)
        setConnectionStatus('Not connected')
      }
    })

    return unsubscribe
  }, [])

  const checkGlassConnection = async () => {
    try {
      setConnectionStatus('Checking glass-pip-chat connection...')
      
      // Check if there are any desktop systems registered
      const systems = await adapter.getLocalSystems()
      const desktopSystems = systems.filter(s => 
        s.name?.toLowerCase().includes('glass') || 
        s.name?.toLowerCase().includes('desktop') ||
        s.capabilities?.features?.includes('desktop-interface')
      )
      
      if (desktopSystems.length > 0) {
        const latestSystem = desktopSystems.sort((a, b) => 
          new Date(b.last_heartbeat).getTime() - new Date(a.last_heartbeat).getTime()
        )[0]
        
        // Check if the system is recently active (within last 2 minutes)
        const lastHeartbeat = new Date(latestSystem.last_heartbeat).getTime()
        const now = Date.now()
        const isRecent = (now - lastHeartbeat) < 2 * 60 * 1000
        
        if (isRecent && latestSystem.status === 'online') {
          setIsConnectedToGlass(true)
          setConnectionStatus(`Connected to ${latestSystem.name}`)
        } else {
          setIsConnectedToGlass(false)
          setConnectionStatus(`${latestSystem.name} offline (last seen ${Math.round((now - lastHeartbeat) / 60000)}m ago)`)
        }
      } else {
        setIsConnectedToGlass(false)
        setConnectionStatus('No glass-pip-chat instances found')
      }
    } catch (error) {
      console.error('Failed to check glass connection:', error)
      setIsConnectedToGlass(false)
      setConnectionStatus('Connection check failed')
    }
  }

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    try {
      const result = await adapter.signIn(email, password)
      if (result.success) {
        // Auth state will be updated via the listener
        await checkGlassConnection()
      }
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    setLoading(true)
    try {
      await adapter.signOut()
      setIsConnectedToGlass(false)
      setConnectionStatus('Not connected')
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Periodically check glass connection
  useEffect(() => {
    if (!user) return

    const interval = setInterval(checkGlassConnection, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [user])

  const value = {
    user,
    session,
    loading,
    signOut,
    signIn,
    isConnectedToGlass,
    connectionStatus,
  }

  return (
    <UnifiedAuthContext.Provider value={value}>
      {children}
    </UnifiedAuthContext.Provider>
  )
}

export function useUnifiedAuth() {
  const context = useContext(UnifiedAuthContext)
  if (context === undefined) {
    throw new Error('useUnifiedAuth must be used within a UnifiedAuthProvider')
  }
  return context
}