'use client'

export interface StreamEvent {
  type: 'response_chunk' | 'status_change' | 'tool_execution' | 'error'
  messageId: string
  data: {
    content?: string
    status?: string
    toolExecution?: any
    error?: string
  }
  timestamp: string
}

export class StreamingService {
  private eventSource: EventSource | null = null
  private listeners: Map<string, (event: StreamEvent) => void> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isReconnecting = false

  constructor(private baseUrl: string = '/api') {}

  // Subscribe to streaming updates for a specific message
  subscribeToMessage(messageId: string, callback: (event: StreamEvent) => void): () => void {
    const listenerId = `${messageId}-${Date.now()}`
    this.listeners.set(listenerId, callback)

    // Start SSE connection if not already started
    if (!this.eventSource) {
      this.startEventSource()
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listenerId)
      if (this.listeners.size === 0) {
        this.stopEventSource()
      }
    }
  }

  // Subscribe to all streaming updates for a session
  subscribeToSession(sessionId: string, callback: (event: StreamEvent) => void): () => void {
    const listenerId = `session-${sessionId}-${Date.now()}`
    this.listeners.set(listenerId, callback)

    if (!this.eventSource) {
      this.startEventSource()
    }

    return () => {
      this.listeners.delete(listenerId)
      if (this.listeners.size === 0) {
        this.stopEventSource()
      }
    }
  }

  private startEventSource() {
    if (this.eventSource) return

    this.eventSource = new EventSource(`${this.baseUrl}/stream`)

    this.eventSource.onmessage = (event) => {
      try {
        const streamEvent: StreamEvent = JSON.parse(event.data)
        
        // Notify all relevant listeners
        this.listeners.forEach((callback, listenerId) => {
          // Check if this listener should receive this event
          if (listenerId.includes(streamEvent.messageId) || 
              listenerId.startsWith('session-')) {
            callback(streamEvent)
          }
        })
      } catch (error) {
        console.error('Error parsing stream event:', error)
      }
    }

    this.eventSource.onerror = (error) => {
      console.error('EventSource error:', error)
      
      if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect()
      }
    }

    this.eventSource.onopen = () => {
      console.log('EventSource connection opened')
      this.reconnectAttempts = 0
      this.isReconnecting = false
    }
  }

  private stopEventSource() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  private attemptReconnect() {
    if (this.isReconnecting) return
    
    this.isReconnecting = true
    this.reconnectAttempts++
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
    
    setTimeout(() => {
      if (this.listeners.size > 0) {
        this.stopEventSource()
        this.startEventSource()
      } else {
        this.isReconnecting = false
      }
    }, this.reconnectDelay * this.reconnectAttempts)
  }

  // Get connection status
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'reconnecting' {
    if (this.isReconnecting) return 'reconnecting'
    if (!this.eventSource) return 'disconnected'
    
    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING:
        return 'connecting'
      case EventSource.OPEN:
        return 'connected'
      case EventSource.CLOSED:
        return 'disconnected'
      default:
        return 'disconnected'
    }
  }

  // Clean up all connections
  destroy() {
    this.listeners.clear()
    this.stopEventSource()
    this.isReconnecting = false
    this.reconnectAttempts = 0
  }
}

// Global streaming service instance
export const streamingService = new StreamingService()