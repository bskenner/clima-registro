import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return () => data.subscription.unsubscribe();
}

export async function ensureDefaultUserData(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email ?? null,
    display_name: user.email?.split('@')[0] ?? null,
  });

  if (profileError) throw new Error(`Erro ao atualizar perfil: ${profileError.message}`);

  const { count, error: countError } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (countError) throw new Error(`Erro ao verificar locais padrão: ${countError.message}`);
  if ((count ?? 0) > 0) return;

  const { data: regions, error: regionError } = await supabase
    .from('regions')
    .insert([
      {
        user_id: user.id,
        name: 'Centro Serra / RS',
        description: 'Região inicial para acompanhamento meteorológico.',
      },
      {
        user_id: user.id,
        name: 'Serra da Mantiqueira / SP',
        description: 'Região inicial para acompanhamento meteorológico.',
      },
    ])
    .select('*');

  if (regionError) throw new Error(`Erro ao criar regiões padrão: ${regionError.message}`);

  const centroSerra = regions?.find((region) => region.name === 'Centro Serra / RS');
  const mantiqueira = regions?.find((region) => region.name === 'Serra da Mantiqueira / SP');

  const { error: locationError } = await supabase.from('locations').insert([
    {
      user_id: user.id,
      region_id: centroSerra?.id ?? null,
      name: 'Sobradinho/RS',
      city: 'Sobradinho',
      state: 'RS',
      country: 'Brasil',
      latitude: -29.419,
      longitude: -53.032,
      is_active: true,
      collect_daily: true,
    },
    {
      user_id: user.id,
      region_id: mantiqueira?.id ?? null,
      name: 'Campos do Jordão/SP',
      city: 'Campos do Jordão',
      state: 'SP',
      country: 'Brasil',
      latitude: -22.739,
      longitude: -45.591,
      is_active: true,
      collect_daily: true,
    },
  ]);

  if (locationError) throw new Error(`Erro ao criar locais padrão: ${locationError.message}`);
}
