import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// عميل السيرفر فقط | SERVER-ONLY client.
// It holds the service-role key, which bypasses RLS. It must never be
// imported into a Client Component — every table has RLS forced on, so
// the browser cannot reach the database at all. All data flows through
// Server Actions in src/app/actions.ts.
export function db() {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
