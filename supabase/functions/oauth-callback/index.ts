// Supabase Edge Function: oauth-callback
// Exchanges OAuth authorization code for access tokens and saves to database

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Environment variables (set in Supabase Dashboard > Edge Functions > Secrets)
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, provider, partnerId, redirectUri } = await req.json()

    console.log('OAuth callback received:', { provider, partnerId, hasCode: !!code })
    console.log('Environment check:', {
      hasGoogleClientId: !!GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!GOOGLE_CLIENT_SECRET,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY
    })

    if (!code || !provider || !partnerId || !redirectUri) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error: Missing Supabase credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

      // Save credentials to database using service role (bypasses RLS)
      console.log('Creating Supabase client with URL:', SUPABASE_URL.substring(0, 30) + '...')
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

      console.log('Attempting to update partner_accounts for:', partnerId)
      const { data: updateData, error: dbError } = await supabase
        .from('partner_accounts')
        .update({
          email_provider: 'gmail',
          email_access_token: tokenData.access_token,
          email_refresh_token: tokenData.refresh_token,
          email_token_expires_at: expiresAt,
          email_address: userInfo.email,
        })
        .eq('id', partnerId)
        .select()

      console.log('Database update result:', { data: updateData, error: dbError })

      if (dbError) {
        console.error('Database save error:', dbError)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save credentials: ' + dbError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!updateData || updateData.length === 0) {
        console.error('No rows updated - partner ID may not exist:', partnerId)
        return new Response(
          JSON.stringify({ success: false, error: 'Partner account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
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
