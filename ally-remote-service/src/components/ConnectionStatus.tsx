'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Loader2, AlertCircle, User } from 'lucide-react'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { useAuth } from '@/contexts/AuthContext'

export function ConnectionStatus() {
  const { status, lastSeen, systemName, streamingStatus, isFullyConnected } = useConnectionStatus()
  const { user } = useAuth()
  const [isOnline, setIsOnline] = useState(true)

  // Monitor browser online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const getStatusIcon = () => {
    // Show user icon if not authenticated
    if (!user) {
      return <User className="w-4 h-4 text-gray-400" />
    }
    
    // Show offline icon if browser is offline
    if (!isOnline) {
      return <WifiOff className="w-4 h-4 text-red-400" />
    }
    
    if (streamingStatus === 'reconnecting') {
      return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
    }
    
    switch (status) {
      case 'online':
        return isFullyConnected ? <Wifi className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4 text-yellow-400" />
      case 'connecting':
        return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
      case 'offline':
        return <WifiOff className="w-4 h-4 text-red-400" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />
      default:
        return <WifiOff className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusText = () => {
    // Show authentication status if not authenticated
    if (!user) {
      return 'Not Authenticated'
    }
    
    // Show offline status if browser is offline
    if (!isOnline) {
      return 'No Internet Connection'
    }
    
    if (streamingStatus === 'reconnecting') {
      return 'Reconnecting...'
    }
    
    switch (status) {
      case 'online':
        if (isFullyConnected) {
          return systemName ? `${systemName} Online` : 'Local System Online'
        } else {
          return 'System Online (Streaming Issues)'
        }
      case 'connecting':
        return 'Connecting...'
      case 'offline':
        return 'Local System Offline'
      case 'error':
        return 'Connection Error'
      default:
        return 'Unknown Status'
    }
  }

  const getStatusColor = () => {
    // Show gray for unauthenticated or offline browser
    if (!user || !isOnline) {
      return 'text-gray-400 border-gray-500/20 bg-gray-500/10'
    }
    
    if (streamingStatus === 'reconnecting') {
      return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
    }
    
    switch (status) {
      case 'online':
        return isFullyConnected 
          ? 'text-green-400 border-green-500/20 bg-green-500/10'
          : 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
      case 'connecting':
        return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
      case 'offline':
        return 'text-red-400 border-red-500/20 bg-red-500/10'
      case 'error':
        return 'text-red-400 border-red-500/20 bg-red-500/10'
      default:
        return 'text-gray-400 border-gray-500/20 bg-gray-500/10'
    }
  }

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return null
    
    const now = new Date()
    const lastSeenDate = new Date(timestamp)
    const diffMs = now.getTime() - lastSeenDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div className={`glass rounded-lg px-3 py-2 border ${getStatusColor()} transition-all duration-200`}>
      <div className="flex items-center space-x-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        
        {/* Status indicator dot */}
        <div className="relative">
          <div className={`w-2 h-2 rounded-full ${
            !user || !isOnline ? 'bg-gray-400' :
            isFullyConnected ? 'bg-green-400' :
            status === 'connecting' || streamingStatus === 'reconnecting' ? 'bg-yellow-400' :
            'bg-red-400'
          }`} />
          {user && isOnline && isFullyConnected && (
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping opacity-75" />
          )}
        </div>
      </div>
      
      {/* Additional status information */}
      {!user && (
        <div className="text-xs text-gray-500 mt-1">
          Please sign in to connect
        </div>
      )}
      
      {user && !isOnline && (
        <div className="text-xs text-gray-500 mt-1">
          Check your internet connection
        </div>
      )}
      
      {user && isOnline && status === 'offline' && lastSeen && (
        <div className="text-xs text-gray-500 mt-1">
          Last seen: {formatLastSeen(lastSeen)}
        </div>
      )}
    </div>
  )
}