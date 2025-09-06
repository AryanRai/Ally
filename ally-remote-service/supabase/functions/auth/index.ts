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

          return new Response(
            JSON.stringify({
              token: data.session?.access_token,
              user: data.user,
              expiresAt: data.session?.expires_at
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (url.pathname.endsWith('/register')) {
          const { email, password } = await req.json()
          
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
              user: data.user,
              message: 'Registration successful. Please check your email for verification.'
            }),
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

          return new Response(
            JSON.stringify({ user }),
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