const viteEnv = import.meta.env ?? ({} as ImportMetaEnv);

export const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = viteEnv.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const APP_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_COUNTRY = 'Brasil';
