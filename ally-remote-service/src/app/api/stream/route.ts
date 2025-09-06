import { NextRequest } from 'next/server'
import { createServerSupabaseClientFromRequest } from '@/lib/supabase-server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClientFromRequest(request)
  
  // Check if user is authenticated with better error handling
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error in stream:', authError)
      return new Response(JSON.stringify({ 
        error: 'Authentication failed', 
        details: authError.message 
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (!user) {
      console.warn('No user found in stream request')
      return new Response(JSON.stringify({ 
        error: 'User not authenticated', 
        details: 'No valid session found' 
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error('Unexpected auth error in stream:', error)
    return new Response(JSON.stringify({ 
      error: 'Authentication check failed', 
      details: (error as Error).message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Set up Server-Sent Events headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  })

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('data: {"type":"connection","status":"connected"}\n\n'))

      // Set up Supabase realtime subscription
      const subscription = supabase
        .channel('message_updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_messages',
          },
          (payload) => {
            const message = payload.new as any
            
            if (message && message.id) {
              // Send response chunk updates
              if (message.response && message.status === 'processing') {
                const event = {
                  type: 'response_chunk',
                  messageId: message.id,
                  data: {
                    content: message.response,
                    status: message.status
                  },
                  timestamp: new Date().toISOString()
                }
                
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
              }
              
              // Send status changes
              if (message.status) {
                const event = {
                  type: 'status_change',
                  messageId: message.id,
                  data: {
                    status: message.status
                  },
                  timestamp: new Date().toISOString()
                }
                
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tool_executions',
          },
          (payload) => {
            const toolExecution = payload.new as any
            
            if (toolExecution && toolExecution.message_id) {
              const event = {
                type: 'tool_execution',
                messageId: toolExecution.message_id,
                data: {
                  toolExecution: toolExecution
                },
                timestamp: new Date().toISOString()
              }
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            }
          }
        )
        .subscribe()

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        subscription.unsubscribe()
        controller.close()
      })

      // Keep connection alive with periodic heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('data: {"type":"heartbeat"}\n\n'))
        } catch (error) {
          clearInterval(heartbeat)
          subscription.unsubscribe()
        }
      }, 30000) // Every 30 seconds

      // Clean up on close
      const cleanup = () => {
        clearInterval(heartbeat)
        subscription.unsubscribe()
      }

      // Store cleanup function for later use
      ;(controller as any).cleanup = cleanup
    },

    cancel() {
      // Cleanup when stream is cancelled
      if ((this as any).cleanup) {
        (this as any).cleanup()
      }
    }
  })

  return new Response(stream, { headers })
}