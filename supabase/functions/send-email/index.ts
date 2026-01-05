// Supabase Edge Function: send-email
// Sends emails via Gmail API on behalf of partners

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

// Helper function to convert base64 to base64url
function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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

    // Helper function to refresh the token
    const refreshAccessToken = async (): Promise<string | null> => {
      if (!partner.email_refresh_token) {
        console.log('No refresh token available')
        return null
      }

      console.log('Refreshing access token...')
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
      console.log('Refresh response:', { status: refreshResponse.status, hasError: !!refreshData.error })

      if (refreshData.error) {
        console.error('Token refresh error:', JSON.stringify(refreshData))
        return null
      }

      const newToken = refreshData.access_token
      const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

      // Update token in database
      await supabase
        .from('partner_accounts')
        .update({
          email_access_token: newToken,
          email_token_expires_at: newExpiresAt,
        })
        .eq('id', partnerId)

      return newToken
    }

    // Check if token is expired or about to expire
    if (partner.email_token_expires_at) {
      const expiresAt = new Date(partner.email_token_expires_at)
      const now = new Date()

      // Refresh if token expires within 5 minutes
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        console.log('Token expired or expiring soon')
        const newToken = await refreshAccessToken()
        if (newToken) {
          accessToken = newToken
        } else {
          return new Response(
            JSON.stringify({ success: false, error: 'Email authorization expired. Please reconnect your email in Settings.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
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

      // Base64url encode the email using Deno's encoder
      const encoder = new TextEncoder()
      const emailBytes = encoder.encode(email)
      const encodedEmail = base64ToBase64Url(base64Encode(emailBytes))

      console.log('Sending email:', {
        from: partner.email_address,
        to,
        subject,
        encodedLength: encodedEmail.length
      })

      // Function to send email with current token
      const sendGmailEmail = async (token: string) => {
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedEmail }),
        })
        const data = await response.json()
        return { response, data }
      }

      let sendResponse = await sendGmailEmail(accessToken)
      console.log('Gmail API response:', { status: sendResponse.response.status, data: JSON.stringify(sendResponse.data) })

      // If 401, try refreshing token and retry once
      if (sendResponse.response.status === 401) {
        console.log('Got 401 from Gmail, attempting token refresh and retry...')
        const newToken = await refreshAccessToken()
        if (newToken) {
          accessToken = newToken
          sendResponse = await sendGmailEmail(newToken)
          console.log('Gmail API retry response:', { status: sendResponse.response.status, data: JSON.stringify(sendResponse.data) })
        }
      }

      if (!sendResponse.response.ok || sendResponse.data.error) {
        console.error('Gmail send error:', JSON.stringify(sendResponse.data))
        // Return detailed error message
        let errorMsg = 'Unknown error'
        if (sendResponse.data.error) {
          errorMsg = sendResponse.data.error.message || sendResponse.data.error.status || JSON.stringify(sendResponse.data.error)
        }
        return new Response(
          JSON.stringify({ success: false, error: `Gmail error (${sendResponse.response.status}): ${errorMsg}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const sendData = sendResponse.data

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
