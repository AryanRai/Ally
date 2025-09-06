import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const url = new URL(req.url)
    const sessionId = url.searchParams.get('sessionId')

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Session ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Set up Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          sessionId,
          timestamp: new Date().toISOString()
        })}\n\n`))

        // Connection state tracking
        let isConnected = true
        let reconnectAttempts = 0
        const maxReconnectAttempts = 5

        // Enhanced error handling function
        const handleStreamError = (error: any, context: string) => {
          console.error(`Stream error in ${context}:`, error)
          if (isConnected) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              data: {
                message: `Connection error in ${context}`,
                recoverable: reconnectAttempts < maxReconnectAttempts
              },
              timestamp: new Date().toISOString()
            })}\n\n`))
          }
        }

        // Set up realtime subscription for message updates with error handling
        const channel = supabaseClient
          .channel(`session_${sessionId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'chat_messages',
              filter: `session_id=eq.${sessionId}`
            },
            (payload) => {
              try {
                const message = payload.new
                if (message.user_id === user.id && isConnected) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'message_update',
                    messageId: message.id,
                    data: {
                      response: message.response,
                      status: message.status,
                      error_message: message.error_message
                    },
                    timestamp: new Date().toISOString()
                  })}\n\n`))
                }
              } catch (error) {
                handleStreamError(error, 'message_update')
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'tool_executions'
            },
            (payload) => {
              try {
                const execution = payload.new
                // Check if this tool execution belongs to a message in this session
                supabaseClient
                  .from('chat_messages')
                  .select('session_id, user_id')
                  .eq('id', execution.message_id)
                  .single()
                  .then(({ data: message }) => {
                    if (message && message.session_id === sessionId && message.user_id === user.id && isConnected) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'tool_execution',
                        messageId: execution.message_id,
                        data: {
                          id: execution.id,
                          tool_name: execution.tool_name,
                          status: execution.status,
                          parameters: execution.parameters,
                          result: execution.result,
                          execution_time_ms: execution.execution_time_ms
                        },
                        timestamp: new Date().toISOString()
                      })}\n\n`))
                    }
                  })
                  .catch(error => handleStreamError(error, 'tool_execution_lookup'))
              } catch (error) {
                handleStreamError(error, 'tool_execution')
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'tool_executions'
            },
            (payload) => {
              try {
                const execution = payload.new
                // Check if this tool execution belongs to a message in this session
                supabaseClient
                  .from('chat_messages')
                  .select('session_id, user_id')
                  .eq('id', execution.message_id)
                  .single()
                  .then(({ data: message }) => {
                    if (message && message.session_id === sessionId && message.user_id === user.id && isConnected) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'tool_execution_update',
                        messageId: execution.message_id,
                        data: {
                          id: execution.id,
                          tool_name: execution.tool_name,
                          status: execution.status,
                          result: execution.result,
                          execution_time_ms: execution.execution_time_ms
                        },
                        timestamp: new Date().toISOString()
                      })}\n\n`))
                    }
                  })
                  .catch(error => handleStreamError(error, 'tool_execution_update_lookup'))
              } catch (error) {
                handleStreamError(error, 'tool_execution_update')
              }
            }
          )
          .subscribe()

        // Set up heartbeat to keep connection alive with enhanced error handling
        const heartbeat = setInterval(() => {
          try {
            if (isConnected) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
                connectionId: sessionId
              })}\n\n`))
            }
          } catch (error) {
            handleStreamError(error, 'heartbeat')
            isConnected = false
            clearInterval(heartbeat)
            channel.unsubscribe()
          }
        }, 30000) // Send heartbeat every 30 seconds

        // Enhanced cleanup function
        const cleanup = () => {
          isConnected = false
          clearInterval(heartbeat)
          try {
            channel.unsubscribe()
          } catch (error) {
            console.error('Error during channel cleanup:', error)
          }
        }

        // Handle client disconnect
        req.signal?.addEventListener('abort', cleanup)
        
        // Store cleanup function for later use
        ;(controller as any).cleanup = cleanup
      },
      
      cancel() {
        // Clean up when stream is cancelled
        isConnected = false
        if ((this as any).cleanup) {
          (this as any).cleanup()
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})