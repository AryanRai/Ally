import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        if (url.pathname.endsWith('/register')) {
          const { systemId, name, capabilities, metadata } = await req.json()

          if (!systemId || !name) {
            return new Response(
              JSON.stringify({ error: 'System ID and name are required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Register or update local system
          const { data, error } = await supabaseClient
            .from('local_systems')
            .upsert({
              id: systemId,
              user_id: user.id,
              name,
              status: 'online',
              capabilities: capabilities || {},
              metadata: metadata || {},
              last_heartbeat: new Date().toISOString()
            })
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ error: 'Failed to register system' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({
              systemId: data.id,
              status: 'registered',
              message: 'System registered successfully'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/heartbeat')) {
          const { systemId, status } = await req.json()

          if (!systemId) {
            return new Response(
              JSON.stringify({ error: 'System ID is required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Update heartbeat
          const { error } = await supabaseClient.rpc('update_system_heartbeat', {
            system_id: systemId,
            new_status: status || 'online'
          })

          if (error) {
            return new Response(
              JSON.stringify({ error: 'Failed to update heartbeat' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({
              systemId,
              status: 'heartbeat_updated',
              timestamp: new Date().toISOString()
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/messages')) {
          const { systemId, batchSize } = await req.json()

          if (!systemId) {
            return new Response(
              JSON.stringify({ error: 'System ID is required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get pending messages for this system
          const { data: messages, error } = await supabaseClient.rpc('get_pending_messages', {
            system_id: systemId,
            batch_size: batchSize || 10
          })

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
            JSON.stringify({
              messages: messages || [],
              count: messages?.length || 0,
              timestamp: new Date().toISOString()
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        break
      }

      case 'GET': {
        // Get all systems for the user
        const { data: systems, error } = await supabaseClient
          .from('local_systems')
          .select('*')
          .eq('user_id', user.id)
          .order('last_heartbeat', { ascending: false })

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to fetch systems' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        return new Response(
          JSON.stringify({ systems }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      case 'PUT': {
        const { systemId, status, capabilities, metadata } = await req.json()

        if (!systemId) {
          return new Response(
            JSON.stringify({ error: 'System ID is required' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        const updateData: any = { last_heartbeat: new Date().toISOString() }
        if (status) updateData.status = status
        if (capabilities) updateData.capabilities = capabilities
        if (metadata) updateData.metadata = metadata

        const { error } = await supabaseClient
          .from('local_systems')
          .update(updateData)
          .eq('id', systemId)
          .eq('user_id', user.id)

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to update system' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        return new Response(
          JSON.stringify({
            systemId,
            status: 'updated',
            timestamp: new Date().toISOString()
          }),
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