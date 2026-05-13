import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

const fallbackUrl = 'https://example.supabase.co';
const fallbackAnonKey = 'missing-anon-key';

export const supabase = createClient(SUPABASE_URL || fallbackUrl, SUPABASE_ANON_KEY || fallbackAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
