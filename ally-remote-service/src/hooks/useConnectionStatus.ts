'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { streamingService } from '@/services/streamingService'
import type { ConnectionStatus, LocalSystem } from '@/types'

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('offline')
  const [lastSeen, setLastSeen] = useState<string>()
  const [systemName, setSystemName] = useState<string>()
  const [streamingStatus, setStreamingStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'reconnecting'>('disconnected')

  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        setStatus('connecting')
        
        const { data, error } = await supabase
          .from('local_systems')
          .select('*')
          .order('last_heartbeat', { ascending: false })
          .limit(1)

        if (error) {
          console.error('Error checking connection status:', error)
          setStatus('error')
          return
        }

        if (!data || data.length === 0) {
          setStatus('offline')
          setLastSeen(undefined)
          setSystemName(undefined)
          return
        }

        const system = data[0] as LocalSystem
        const now = new Date()
        const lastHeartbeat = new Date(system.last_heartbeat)
        const timeDiff = now.getTime() - lastHeartbeat.getTime()
        
        // Consider system online if heartbeat is within last 30 seconds
        if (timeDiff < 30000 && system.status === 'online') {
          setStatus('online')
        } else {
          setStatus('offline')
        }
        
        setLastSeen(system.last_heartbeat)
        setSystemName(system.name)
        
      } catch (err) {
        console.error('Connection status check failed:', err)
        setStatus('error')
      }
    }

    // Check streaming service status
    const checkStreamingStatus = () => {
      const newStreamingStatus = streamingService.getConnectionStatus()
      setStreamingStatus(newStreamingStatus)
    }

    // Initial checks
    checkConnectionStatus()
    checkStreamingStatus()

    // Set up periodic checks
    const interval = setInterval(() => {
      checkConnectionStatus()
      checkStreamingStatus()
    }, 5000) // Check every 5 seconds

    // Set up real-time subscription for system status changes
    const subscription = supabase
      .channel('local_systems_status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'local_systems'
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const system = payload.new as LocalSystem
            const now = new Date()
            const lastHeartbeat = new Date(system.last_heartbeat)
            const timeDiff = now.getTime() - lastHeartbeat.getTime()
            
            if (timeDiff < 30000 && system.status === 'online') {
              setStatus('online')
            } else {
              setStatus('offline')
            }
            
            setLastSeen(system.last_heartbeat)
            setSystemName(system.name)
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      subscription.unsubscribe()
    }
  }, [])

  return {
    status,
    lastSeen,
    systemName,
    streamingStatus,
    isFullyConnected: status === 'online' && streamingStatus === 'connected'
  }
}