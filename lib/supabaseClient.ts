import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseAssetUrl } from './supabaseAssetUrl';

// Production is intentionally served from Ben's local PC via Tailscale Funnel.
// Rollback target, hosted Supabase: https://mvkbmozwplhsduiiakql.supabase.co
// Desktop clients launched from file:// do not have a browser origin to infer.
// Use the Linux-hosted Tailnet portal proxy, not the retired Windows node.
const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://100.97.15.55:8080/supabase';
// SECURITY: the fallback below is the publicly known supabase-demo key. Set
// SUPABASE_ANON_KEY at build time after rotating the JWT secret on the
// self-hosted instance — see SECURITY_ROTATE_SUPABASE_KEYS.md.
const LOCAL_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const getSupabaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    // Vercel's router-level external rewrites can fail against Ben's Tailscale
    // Funnel custom HTTPS ports. Use the bundled serverless proxy for the
    // Vercel-hosted app, while preserving same-origin routing on the live local
    // portal host.
    if (window.location.hostname.endsWith('vercel.app')) {
      return `${window.location.origin}/api/supabase`;
    }
    return `${window.location.origin}/supabase`;
  }
  return LOCAL_SUPABASE_URL;
};

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = LOCAL_SUPABASE_ANON_KEY;

const PORTAL_ORIGIN = 'http://100.97.15.55:8080';

export const normalizeSupabaseAssetUrl = (url?: string | null): string | undefined =>
  resolveSupabaseAssetUrl(url, {
    browserOrigin:
      typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? window.location.origin
        : null,
    supabaseUrl: SUPABASE_URL,
    portalOrigin: PORTAL_ORIGIN,
  });

// Browser code must not bundle a service-role key. Keep the admin export for legacy imports,
// but bind it to the publishable/anon key so privileged operations still require server-side routes.
const SUPABASE_SERVICE_ROLE_KEY = LOCAL_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
