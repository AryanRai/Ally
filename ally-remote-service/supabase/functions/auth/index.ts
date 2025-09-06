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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { method } = req
    const url = new URL(req.url)

    switch (method) {
      case 'POST': {
        if (url.pathname.endsWith('/login')) {
          const { email, password, deviceId } = await req.json()
          
          // Input validation
          if (!email || !password) {
            return new Response(
              JSON.stringify({ error: 'Email and password are required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
          })

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Log successful login with device info if provided
          if (deviceId && data.user) {
            try {
              await supabaseClient
                .from('user_sessions')
                .insert({
                  user_id: data.user.id,
                  device_id: deviceId,
                  login_at: new Date().toISOString(),
                  ip_address: req.headers.get('x-forwarded-for') || 'unknown'
                })
            } catch (sessionError) {
              // Don't fail login if session logging fails
              console.error('Failed to log session:', sessionError)
            }
          }

          return new Response(
            JSON.stringify({
              token: data.session?.access_token,
              refreshToken: data.session?.refresh_token,
              user: {
                id: data.user?.id,
                email: data.user?.email,
                emailVerified: data.user?.email_confirmed_at ? true : false
              },
              expiresAt: data.session?.expires_at,
              deviceId
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/register')) {
          const { email, password, confirmPassword } = await req.json()
          
          // Input validation
          if (!email || !password) {
            return new Response(
              JSON.stringify({ error: 'Email and password are required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          if (password.length < 8) {
            return new Response(
              JSON.stringify({ error: 'Password must be at least 8 characters long' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          if (confirmPassword && password !== confirmPassword) {
            return new Response(
              JSON.stringify({ error: 'Passwords do not match' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
          })

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({
              user: {
                id: data.user?.id,
                email: data.user?.email,
                emailVerified: false
              },
              message: 'Registration successful. Please check your email for verification.',
              requiresVerification: !data.session // If no session, email verification required
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/refresh')) {
          const { refreshToken } = await req.json()
          
          if (!refreshToken) {
            return new Response(
              JSON.stringify({ error: 'Refresh token is required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const { data, error } = await supabaseClient.auth.refreshSession({
            refresh_token: refreshToken
          })

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({
              token: data.session?.access_token,
              refreshToken: data.session?.refresh_token,
              expiresAt: data.session?.expires_at
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/logout')) {
          const authHeader = req.headers.get('Authorization')
          if (authHeader) {
            const token = authHeader.replace('Bearer ', '')
            await supabaseClient.auth.signOut(token)
          }

          return new Response(
            JSON.stringify({ message: 'Logged out successfully' }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        break
      }

      case 'GET': {
        if (url.pathname.endsWith('/user')) {
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
          const { data: { user }, error } = await supabaseClient.auth.getUser(token)

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get user's local systems
          const { data: systems } = await supabaseClient
            .from('local_systems')
            .select('id, name, status, last_heartbeat')
            .eq('user_id', user.id)

          return new Response(
            JSON.stringify({ 
              user: {
                id: user.id,
                email: user.email,
                emailVerified: user.email_confirmed_at ? true : false,
                createdAt: user.created_at
              },
              localSystems: systems || []
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/validate')) {
          const authHeader = req.headers.get('Authorization')
          if (!authHeader) {
            return new Response(
              JSON.stringify({ valid: false, error: 'No authorization header' }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const token = authHeader.replace('Bearer ', '')
          const { data: { user }, error } = await supabaseClient.auth.getUser(token)

          return new Response(
            JSON.stringify({ 
              valid: !error && !!user,
              user: user ? {
                id: user.id,
                email: user.email
              } : null,
              error: error?.message
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
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