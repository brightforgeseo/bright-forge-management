import { createClient } from '@supabase/supabase-js';

// Production is intentionally served from Ben's local PC via Tailscale Funnel.
// Rollback target, hosted Supabase: https://mvkbmozwplhsduiiakql.supabase.co
const LOCAL_SUPABASE_URL = 'https://echo-ai.tailfdbc33.ts.net:10000';
const LOCAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const getSupabaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    // Vercel cannot reliably proxy Ben's Tailscale Funnel services on custom
    // HTTPS ports. Use the public Funnel Supabase endpoint directly for the
    // Vercel-hosted web app, while preserving same-origin routing on the live
    // local portal host.
    if (window.location.hostname.endsWith('vercel.app')) {
      return LOCAL_SUPABASE_URL;
    }
    return `${window.location.origin}/supabase`;
  }
  return LOCAL_SUPABASE_URL;
};

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = LOCAL_SUPABASE_ANON_KEY;

const SUPABASE_ASSET_BASES = [
  'http://127.0.0.1:54321',
  'https://echo-ai.tailfdbc33.ts.net:10000',
  'https://bright-forge-management.vercel.app/supabase'
];

export const normalizeSupabaseAssetUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  const value = String(url);
  const base = SUPABASE_ASSET_BASES.find(prefix => value.startsWith(`${prefix}/storage/v1/`));
  if (!base) return value;
  return `${SUPABASE_URL}${value.slice(base.length)}`;
};

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
