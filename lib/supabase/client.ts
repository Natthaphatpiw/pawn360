import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
}

// All Supabase access in this app is server-side (API routes / lib services) and uses
// the SERVICE ROLE key via supabaseAdmin(). The anon key client was intentionally
// removed: with RLS enabled on every table, service_role bypasses RLS so server queries
// keep working, while the public anon key (which is blocked by RLS) is used nowhere.
// If a browser/RLS-scoped client is ever needed, add it deliberately with proper policies.
export const supabaseAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey);
};
