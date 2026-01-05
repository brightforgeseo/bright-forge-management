// Supabase Edge Function: send-email
// Sends emails via Gmail API on behalf of partners

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { partnerId, to, subject, body } = await req.json()

    console.log('Send email request:', { partnerId, to, subject, hasBody: !!body })
    console.log('Environment check:', {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      hasGoogleClientId: !!GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!GOOGLE_CLIENT_SECRET
    })

    if (!partnerId || !to || !subject || !body) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch partner's email credentials
    const { data: partner, error: partnerError } = await supabase
      .from('partner_accounts')
      .select('email_provider, email_access_token, email_refresh_token, email_token_expires_at, email_address')
      .eq('id', partnerId)
      .single()

    if (partnerError || !partner) {
      return new Response(
        JSON.stringify({ success: false, error: 'Partner not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Partner data:', {
      email_provider: partner.email_provider,
      email_address: partner.email_address,
      has_access_token: !!partner.email_access_token,
      has_refresh_token: !!partner.email_refresh_token,
      token_expires_at: partner.email_token_expires_at
    })

    if (!partner.email_provider || !partner.email_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email not connected. Please connect your email in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let accessToken = partner.email_access_token

    // Check if token is expired and refresh if needed
    if (partner.email_token_expires_at) {
      const expiresAt = new Date(partner.email_token_expires_at)
      const now = new Date()

      // Refresh if token expires within 5 minutes
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        console.log('Token expired or expiring soon, refreshing...')

        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: partner.email_refresh_token,
            grant_type: 'refresh_token',
          }),
        })

        const refreshData = await refreshResponse.json()

        if (refreshData.error) {
          console.error('Token refresh error:', refreshData)
          return new Response(
            JSON.stringify({ success: false, error: 'Email authorization expired. Please reconnect your email.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        accessToken = refreshData.access_token
        const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

        // Update token in database
        await supabase
          .from('partner_accounts')
          .update({
            email_access_token: accessToken,
            email_token_expires_at: newExpiresAt,
          })
          .eq('id', partnerId)
      }
    }

    // Send email via Gmail API
    if (partner.email_provider === 'gmail') {
      // Create email in RFC 2822 format
      const emailLines = [
        `From: ${partner.email_address}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ]
      const email = emailLines.join('\r\n')

      // Base64url encode the email
      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      })

      const sendData = await sendResponse.json()

      if (sendData.error) {
        console.error('Gmail send error:', sendData)
        return new Response(
          JSON.stringify({ success: false, error: sendData.error.message || 'Failed to send email' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, messageId: sendData.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unsupported email provider' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Send email error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
