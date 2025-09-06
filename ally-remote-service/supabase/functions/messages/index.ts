import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting configuration
const RATE_LIMITS = {
  messagesPerMinute: 30,
  messagesPerHour: 500
}

// In-memory rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number, resetTime: number }>()

function checkRateLimit(userId: string, limitType: 'minute' | 'hour'): boolean {
  const now = Date.now()
  const key = `${userId}:${limitType}`
  const windowMs = limitType === 'minute' ? 60 * 1000 : 60 * 60 * 1000
  const limit = limitType === 'minute' ? RATE_LIMITS.messagesPerMinute : RATE_LIMITS.messagesPerHour
  
  const current = rateLimitStore.get(key)
  
  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (current.count >= limit) {
    return false
  }
  
  current.count++
  return true
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

    const { method } = req
    const url = new URL(req.url)

    switch (method) {
      case 'POST': {
        // Check rate limits
        if (!checkRateLimit(user.id, 'minute')) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded: too many messages per minute' }),
            { 
              status: 429, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        if (!checkRateLimit(user.id, 'hour')) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded: too many messages per hour' }),
            { 
              status: 429, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        const { content, sessionId, metadata, localSystemId } = await req.json()

        // Validate input
        if (!content || content.trim().length === 0) {
          return new Response(
            JSON.stringify({ error: 'Message content is required' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        // Additional input validation
        if (content.length > 10000) {
          return new Response(
            JSON.stringify({ error: 'Message content too long (max 10000 characters)' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        // Create or get session
        let currentSessionId = sessionId
        if (!currentSessionId) {
          const { data: sessionData, error: sessionError } = await supabaseClient
            .from('chat_sessions')
            .insert({
              user_id: user.id,
              title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
              is_remote: true,
              metadata: metadata || {}
            })
            .select()
            .single()

          if (sessionError) {
            return new Response(
              JSON.stringify({ error: 'Failed to create session' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          currentSessionId = sessionData.id
        }

        // Create message
        const { data: messageData, error: messageError } = await supabaseClient
          .from('chat_messages')
          .insert({
            session_id: currentSessionId,
            user_id: user.id,
            content: content.trim(),
            is_remote: true,
            local_system_id: localSystemId || 'default',
            metadata: metadata || {},
            status: 'pending'
          })
          .select()
          .single()

        if (messageError) {
          return new Response(
            JSON.stringify({ error: 'Failed to create message' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        return new Response(
          JSON.stringify({
            messageId: messageData.id,
            sessionId: currentSessionId,
            status: 'pending',
            estimatedProcessingTime: 5000 // 5 seconds estimate
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      case 'GET': {
        const sessionId = url.searchParams.get('sessionId')
        const limit = parseInt(url.searchParams.get('limit') || '50')
        const offset = parseInt(url.searchParams.get('offset') || '0')

        if (sessionId) {
          // Get messages for specific session
          const { data: messages, error } = await supabaseClient
            .from('chat_messages')
            .select(`
              id,
              content,
              response,
              status,
              error_message,
              metadata,
              created_at,
              updated_at,
              tool_executions (
                id,
                tool_name,
                parameters,
                result,
                status,
                execution_time_ms,
                created_at
              )
            `)
            .eq('session_id', sessionId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .range(offset, offset + limit - 1)

          if (error) {
            return new Response(
              JSON.stringify({ error: 'Failed to fetch messages' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({ messages }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        } else {
          // Get all sessions for user
          const { data: sessions, error } = await supabaseClient
            .from('chat_sessions')
            .select(`
              id,
              title,
              created_at,
              updated_at,
              metadata,
              chat_messages!inner(count)
            `)
            .eq('user_id', user.id)
            .eq('is_remote', true)
            .order('updated_at', { ascending: false })
            .range(offset, offset + limit - 1)

          if (error) {
            return new Response(
              JSON.stringify({ error: 'Failed to fetch sessions' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({ sessions }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
      }

      case 'PUT': {
        const messageId = url.searchParams.get('messageId')
        if (!messageId) {
          return new Response(
            JSON.stringify({ error: 'Message ID is required' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        const { status, errorMessage, response } = await req.json()

        const updateData: any = {}
        if (status) updateData.status = status
        if (errorMessage) updateData.error_message = errorMessage
        if (response) updateData.response = response

        const { error } = await supabaseClient
          .from('chat_messages')
          .update(updateData)
          .eq('id', messageId)
          .eq('user_id', user.id)

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to update message' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

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