// POST /functions/v1/bank-connect
// Corps : { consentAccepted: true, consentVersion: string, connectionId?: string }
// Crée (ou réutilise) l'utilisateur chez le prestataire, enregistre la tentative et renvoie l'URL
// du parcours officiel du prestataire. VAULT ne voit jamais les identifiants bancaires.
import { adminClient, configuredProvider, corsHeaders, env, getProvider, json, log, randomToken, readJson, requireUser } from '../_shared/server/context.ts';
import { ProviderError } from '../_shared/banking/types.ts';

export const CONSENT_VERSION = '2026-10-14';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const provider = getProvider();
  if (!provider) return json({ error: 'provider_not_configured', provider: configuredProvider() }, 503);

  const body = await readJson<{ consentAccepted?: boolean; consentVersion?: string; connectionId?: string }>(req);
  if (!body?.consentAccepted || body.consentVersion !== CONSENT_VERSION) return json({ error: 'consent_required' }, 400);

  const db = adminClient();
  // Limite : 5 tentatives par heure et par utilisateur.
  const { count } = await db
    .from('bank_connect_attempts')
    .select('state', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 5) return json({ error: 'too_many_attempts' }, 429);

  let providerConnectionId: string | null = null;
  if (body.connectionId) {
    const { data: conn } = await db.from('bank_connections').select('provider_connection_id, user_id').eq('id', body.connectionId).maybeSingle();
    if (!conn || conn.user_id !== user.id) return json({ error: 'not_found' }, 404);
    providerConnectionId = conn.provider_connection_id;
  }

  try {
    const { data: existing } = await db.from('bank_provider_users').select('provider_user_id').eq('user_id', user.id).eq('provider', provider.id).maybeSingle();
    const { providerUserId } = await provider.ensureUser(user.id, existing?.provider_user_id ?? null);
    if (!existing) await db.from('bank_provider_users').insert({ user_id: user.id, provider: provider.id, provider_user_id: providerUserId });

    // Bridge limite `context` à 100 caractères alphanumériques et tirets.
    const state = randomToken(24);
    await db.from('bank_connect_attempts').insert({
      state,
      user_id: user.id,
      provider: provider.id,
      connection_id: body.connectionId ?? null,
      consent_version: CONSENT_VERSION,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    const session = await provider.createConnectSession({
      providerUserId,
      appUserId: user.id,
      email: user.email,
      callbackUrl: `${env('SUPABASE_URL')}/functions/v1/bank-callback`,
      state,
      providerConnectionId,
    });
    await db.rpc('audit', { p_user: user.id, p_action: 'bank.connect_started', p_target: provider.id, p_meta: {} });
    log('bank_connect_started', { provider: provider.id });
    return json({ url: session.url });
  } catch (e) {
    log('bank_connect_failed', { provider: provider.id, code: e instanceof ProviderError ? e.code : 'internal' });
    return json({ error: 'provider_error', retryable: e instanceof ProviderError ? e.retryable : true }, 502);
  }
});
