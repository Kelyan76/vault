// Outils communs aux Edge Functions (Deno). Ne jamais journaliser de jeton, de secret ni de donnée financière.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { BridgeProvider } from '../banking/bridge.ts';
import { EnableBankingProvider } from '../banking/enablebanking.ts';
import type { BankingProvider } from '../banking/types.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Variable serveur manquante : ${name}`);
  return v;
}

/** Client avec la clé service_role : contourne RLS, à n'utiliser qu'après avoir identifié l'utilisateur. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Identifie l'appelant à partir de son JWT Supabase ; renvoie null si absent ou invalide. */
export async function requireUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export type ConfiguredProvider = 'bridge' | 'powens' | 'enablebanking' | 'none';

export function configuredProvider(): ConfiguredProvider {
  const p = Deno.env.get('BANKING_PROVIDER') ?? 'none';
  if (p === 'bridge' && Deno.env.get('BRIDGE_CLIENT_ID') && Deno.env.get('BRIDGE_CLIENT_SECRET')) return 'bridge';
  if (p === 'enablebanking' && Deno.env.get('ENABLE_BANKING_APP_ID') && Deno.env.get('ENABLE_BANKING_PRIVATE_KEY')) return 'enablebanking';
  if (p === 'powens') return 'powens';
  return 'none';
}

/** Prestataire réellement configuré, ou null : l'appli affiche alors « non configuré », jamais une fausse connexion. */
export function getProvider(): BankingProvider | null {
  switch (configuredProvider()) {
    case 'bridge':
      return new BridgeProvider({ clientId: env('BRIDGE_CLIENT_ID'), clientSecret: env('BRIDGE_CLIENT_SECRET') });
    case 'enablebanking':
      return new EnableBankingProvider({ applicationId: env('ENABLE_BANKING_APP_ID'), privateKeyPem: env('ENABLE_BANKING_PRIVATE_KEY') });
    case 'powens':
      // L'adaptateur Powens n'est pas encore implémenté : voir docs/BANKING_PROVIDERS.md.
      return null;
    default:
      return null;
  }
}

export async function readJson<T>(req: Request, maxBytes = 10_000): Promise<T | null> {
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function log(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  // Journal minimal : identifiants internes et codes, jamais de montants, libellés, jetons ou IBAN.
  console.log(JSON.stringify({ event, ...fields }));
}
