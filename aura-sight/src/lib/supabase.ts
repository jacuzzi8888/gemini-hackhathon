import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // In 2026 industry standards, we throw early and catch in the Error Boundary
  // instead of letting the app fail silently with a black screen.
  throw new Error(
    "CONFIGURATION_ERROR: Missing Supabase environment variables. " +
    "Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env or Vercel settings."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
