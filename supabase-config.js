
import { createClient } from
"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://bfiisyiurhbqkiycugqn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_g0tupYqD8HC3k9lilwz24g_A8vSgnef";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("YOUR_") ||
    SUPABASE_ANON_KEY.includes("YOUR_")) {
  throw new Error("Supabase URL और Publishable Key सेट करें।");
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
