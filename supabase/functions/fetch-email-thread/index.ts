// Supabase Edge Function: fetch-email-thread
// Fetches email thread/replies from Gmail API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

interface EmailMessage {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  body: string
  date: string
  isFromPartner: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { partnerId, taskId } = await req.json()

    console.log('Fetch email thread request:', { partnerId, taskId })

    if (!partnerId || !taskId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get partner's email credentials
    const { data: partner, error: partnerError } = await supabase
      .from('partner_accounts')
      .select('email_access_token, email_refresh_token, email_token_expires_at, email_address')
      .eq('id', partnerId)
      .single()

    if (partnerError || !partner || !partner.email_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email not connected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get sent emails for this task
    const { data: sentEmails, error: sentError } = await supabase
      .from('partner_sent_emails')
      .select('gmail_thread_id, recipient_email')
      .eq('partner_id', partnerId)
      .eq('task_id', taskId)
      .order('sent_at', { ascending: false })
      .limit(1)

    if (sentError || !sentEmails || sentEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, messages: [], hasThread: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const threadId = sentEmails[0].gmail_thread_id
    let accessToken = partner.email_access_token

    // Helper function to refresh token
    const refreshAccessToken = async (): Promise<string | null> => {
      if (!partner.email_refresh_token) return null

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
      if (refreshData.error) return null

      const newToken = refreshData.access_token
      const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

      await supabase
        .from('partner_accounts')
        .update({ email_access_token: newToken, email_token_expires_at: newExpiresAt })
        .eq('id', partnerId)

      return newToken
    }

    // Check if token needs refresh
    if (partner.email_token_expires_at) {
      const expiresAt = new Date(partner.email_token_expires_at)
      if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
        const newToken = await refreshAccessToken()
        if (newToken) accessToken = newToken
      }
    }

    // Fetch thread from Gmail API
    const fetchThread = async (token: string) => {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return { response, data: await response.json() }
    }

    let threadResponse = await fetchThread(accessToken)

    // Retry with refresh if 401
    if (threadResponse.response.status === 401) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        accessToken = newToken
        threadResponse = await fetchThread(newToken)
      }
    }

    if (!threadResponse.response.ok || threadResponse.data.error) {
      console.error('Gmail thread fetch error:', threadResponse.data)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch email thread' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse messages from thread
    const messages: EmailMessage[] = []
    const partnerEmail = partner.email_address?.toLowerCase()

    for (const msg of threadResponse.data.messages || []) {
      const headers = msg.payload?.headers || []
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

      const from = getHeader('From')
      const to = getHeader('To')
      const subject = getHeader('Subject')
      const date = getHeader('Date')

      // Get body - check for plain text first, then html
      let body = ''
      const payload = msg.payload

      if (payload?.body?.data) {
        body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      } else if (payload?.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
            break
          }
          if (part.mimeType === 'text/html' && part.body?.data && !body) {
            // Strip HTML tags for display
            const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
            body = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
          }
        }
      }

      const isFromPartner = from.toLowerCase().includes(partnerEmail || '')

      messages.push({
        id: msg.id,
        threadId: msg.threadId,
        from,
        to,
        subject,
        body,
        date,
        isFromPartner,
      })
    }

    // Sort by date
    messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Update has_replies flag if there are replies
    const hasReplies = messages.length > 1
    if (hasReplies) {
      await supabase
        .from('partner_sent_emails')
        .update({ has_replies: true, last_checked_at: new Date().toISOString() })
        .eq('gmail_thread_id', threadId)
    }

    return new Response(
      JSON.stringify({ success: true, messages, hasThread: true, threadId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Fetch email thread error:', error)
    return new Response(
      JSON.stringify({ success: false, error: `Internal error: ${error.message}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
