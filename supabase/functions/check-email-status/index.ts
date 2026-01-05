// Supabase Edge Function: check-email-status
// Diagnostic endpoint to check Gmail token status

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { partnerId } = await req.json()

    if (!partnerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing partnerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch partner's email credentials
    const { data: partner, error: partnerError } = await supabase
      .from('partner_accounts')
      .select('email_provider, email_access_token, email_refresh_token, email_token_expires_at, email_address')
      .eq('id', partnerId)
      .single()

    if (partnerError || !partner) {
      return new Response(
        JSON.stringify({ success: false, error: 'Partner not found', details: partnerError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const diagnostics: any = {
      email_provider: partner.email_provider,
      email_address: partner.email_address,
      has_access_token: !!partner.email_access_token,
      has_refresh_token: !!partner.email_refresh_token,
      token_expires_at: partner.email_token_expires_at,
      token_expired: partner.email_token_expires_at ? new Date(partner.email_token_expires_at) < new Date() : 'unknown',
    }

    // If we have an access token, try to validate it with Gmail API
    if (partner.email_access_token) {
      try {
        const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${partner.email_access_token}` },
        })
        const profileData = await profileResponse.json()

        diagnostics.token_valid = profileResponse.ok
        diagnostics.gmail_api_status = profileResponse.status
        diagnostics.gmail_profile = profileResponse.ok ? profileData : null
        diagnostics.gmail_error = profileResponse.ok ? null : profileData.error
      } catch (e: any) {
        diagnostics.token_valid = false
        diagnostics.gmail_api_error = e.message
      }
    }

    return new Response(
      JSON.stringify({ success: true, diagnostics }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
