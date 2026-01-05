// Supabase Edge Function: oauth-callback
// Exchanges OAuth authorization code for access tokens

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Environment variables (set in Supabase Dashboard > Edge Functions > Secrets)
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, provider, partnerId, redirectUri } = await req.json()

    if (!code || !provider || !partnerId || !redirectUri) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (provider === 'gmail') {
      // Exchange code for tokens with Google
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenResponse.json()

      if (tokenData.error) {
        console.error('Google token error:', tokenData)
        return new Response(
          JSON.stringify({ success: false, error: tokenData.error_description || tokenData.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get user's email address
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const userInfo = await userInfoResponse.json()

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

      return new Response(
        JSON.stringify({
          success: true,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt,
          email: userInfo.email,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Outlook support can be added here
    if (provider === 'outlook') {
      return new Response(
        JSON.stringify({ success: false, error: 'Outlook integration coming soon' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unsupported provider' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('OAuth callback error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
