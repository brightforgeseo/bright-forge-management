import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseAssetUrl } from './supabaseAssetUrl';

// Production is intentionally served from Ben's local PC via Tailscale Funnel.
// Rollback target, hosted Supabase: https://mvkbmozwplhsduiiakql.supabase.co
// Desktop clients launched from file:// do not have a browser origin to infer.
// Use the Linux-hosted Tailnet portal proxy, not the retired Windows node.
const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'https://echo-ben.tailfdbc33.ts.net/supabase';
// Public anon key is supplied at build time. Never embed a stock/demo fallback.
const LOCAL_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!LOCAL_SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is required at build time');

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

const PORTAL_ORIGIN = 'https://echo-ben.tailfdbc33.ts.net';

export const normalizeSupabaseAssetUrl = (url?: string | null): string | undefined =>
  resolveSupabaseAssetUrl(url, {
    browserOrigin:
      typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? window.location.origin
        : null,
    supabaseUrl: SUPABASE_URL,
    portalOrigin: PORTAL_ORIGIN,
  });

// One browser client owns login, refresh, logout and Realtime state. An anon
// publishable key identifies the project; the signed-in session supplies authority.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** @deprecated Compatibility alias only: same user session, NO admin authority. */
export const supabaseAdmin = supabase;

export const ACCOUNT_ADMIN_UNAVAILABLE =
  'Account administration is unavailable until a verified server-side owner route is configured. Contact Ben.';

export const requirePortalUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Please sign in again.');
  return data.user;
};
