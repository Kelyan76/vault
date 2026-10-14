import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { config, isSupabaseConfigured } from './config';
import { kv } from './kv';

let client: SupabaseClient | null = null;

/** Client Supabase, ou null si le projet n'est pas configuré (l'appli reste utilisable en local et en démo). */
export function supabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      storage: kv.storage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

export class BackendError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Appelle une Edge Function avec le jeton de l'utilisateur connecté. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const sb = supabase();
  if (!sb) throw new BackendError('not_configured', 'Serveur VAULT non configuré.');
  const { data, error } = await sb.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error) {
    let code = 'server_error';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? code;
    } catch {
      /* réponse non JSON */
    }
    throw new BackendError(code, error.message);
  }
  return data as T;
}
