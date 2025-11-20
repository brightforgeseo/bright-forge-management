import { createClient } from '@supabase/supabase-js';

// Explicitly defining the URL and Key to ensure stability
const PROJECT_ID = 'mvkbmozwplhsduiiakql';
const SUPABASE_URL = `https://${PROJECT_ID}.supabase.co`;

// The key provided by the user
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2Jtb3p3cGxoc2R1aWlha3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MjMxNjYsImV4cCI6MjA3MDI5OTE2Nn0.pHAgLhD7KM-1dSMdfIM25QQq-n6iAM8fXIguGC-_d9k';

// Create the client with explicit parameters to avoid any process.env ambiguity
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
