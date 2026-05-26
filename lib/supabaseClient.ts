import { createClient } from '@supabase/supabase-js';

// Hosted Supabase remains the production fallback. Local development can override via .env.local.
const PROJECT_ID = 'mvkbmozwplhsduiiakql';
const HOSTED_SUPABASE_URL = `https://${PROJECT_ID}.supabase.co`;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || HOSTED_SUPABASE_URL;

// Hosted anon key remains the production fallback. Local development can override via .env.local.
const HOSTED_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2Jtb3p3cGxoc2R1aWlha3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MjMxNjYsImV4cCI6MjA3MDI5OTE2Nn0.pHAgLhD7KM-1dSMdfIM25QQq-n6iAM8fXIguGC-_d9k';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || HOSTED_SUPABASE_ANON_KEY;

// Hosted service role key remains the production fallback. Local development can override via .env.local.
const HOSTED_SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2Jtb3p3cGxoc2R1aWlha3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDcyMzE2NiwiZXhwIjoyMDcwMjk5MTY2fQ.tZrqZjGl_wspvHCOAXBT4-4m_EC8v3w7bdXWud4D5W4';
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || HOSTED_SUPABASE_SERVICE_ROLE_KEY;

// Create the client with explicit parameters to avoid any process.env ambiguity
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client for user management (only use for admin operations)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
