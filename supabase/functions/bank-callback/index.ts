// GET /functions/v1/bank-callback  (URL de retour du parcours prestataire, sans JWT)
// Bridge ajoute : user_uuid, item_id, success, step, source, context (= notre `state`).
// On ne fait confiance à aucun paramètre : l'item est relu chez le prestataire avec le jeton de l'utilisateur
// avant d'être enregistré, puis l'appli est rouverte via son lien profond.
import { adminClient, getProvider, log } from '../_shared/server/context.ts';
import { supabaseSyncRepository } from '../_shared/server/sync-repository.ts';
import { runSync } from '../_shared/banking/orchestrator.ts';

function backToApp(params: Record<string, string>): Response {
  const url = new URL(Deno.env.get('APP_RETURN_URL') ?? 'vault://bank/callback');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get('context');
  const itemId = url.searchParams.get('item_id');
  const success = url.searchParams.get('success') === 'true';
  if (!state || !/^[a-f0-9]{48}$/.test(state)) return backToApp({ status: 'invalid' });

  const db = adminClient();
  const { data: attempt } = await db.from('bank_connect_attempts').select('*').eq('state', state).maybeSingle();
  if (!attempt || attempt.consumed_at || new Date(attempt.expires_at).getTime() < Date.now()) return backToApp({ status: 'expired' });
  // Usage unique du `state` (protection contre le rejeu).
  const { data: consumed } = await db.from('bank_connect_attempts').update({ consumed_at: new Date().toISOString() }).eq('state', state).is('consumed_at', null).select('state');
  if (!consumed?.length) return backToApp({ status: 'expired' });

  if (!success || !itemId) {
    log('bank_callback_cancelled', { step: url.searchParams.get('step') ?? 'unknown' });
    return backToApp({ status: 'cancelled' });
  }
  const provider = getProvider();
  if (!provider || provider.id !== attempt.provider) return backToApp({ status: 'not_configured' });

  const { data: pu } = await db.from('bank_provider_users').select('provider_user_id').eq('user_id', attempt.user_id).eq('provider', provider.id).maybeSingle();
  if (!pu) return backToApp({ status: 'error' });
  const callbackUser = url.searchParams.get('user_uuid');
  if (callbackUser && callbackUser !== pu.provider_user_id) return backToApp({ status: 'error' });

  try {
    // Vérification : l'item doit exister pour CET utilisateur chez le prestataire.
    const remote = await provider.getConnection(pu.provider_user_id, itemId);
    const { data: conn, error } = await db
      .from('bank_connections')
      .upsert(
        {
          user_id: attempt.user_id,
          provider: provider.id,
          provider_connection_id: remote.providerConnectionId,
          status: remote.status === 'connected' ? 'syncing' : remote.status,
          provider_status_code: remote.providerStatusCode,
          consent_expires_at: remote.consentExpiresAt,
          disconnected_at: null,
        },
        { onConflict: 'provider,provider_connection_id' },
      )
      .select('id, user_id')
      .single();
    if (error || !conn || conn.user_id !== attempt.user_id) return backToApp({ status: 'error' });

    // Récompense de bienvenue : une seule fois par compte, quelle que soit la banque.
    await db.rpc('award_xp', { p_user: attempt.user_id, p_key: 'first_bank_connection', p_reason: 'first_bank_connection', p_amount: 30, p_label: 'Première connexion bancaire' });
    await db.rpc('audit', { p_user: attempt.user_id, p_action: 'bank.connected', p_target: conn.id, p_meta: {} });

    // Synchronisation initiale en arrière-plan : l'utilisateur revient tout de suite dans l'appli.
    const job = runSync(
      { repo: supabaseSyncRepository(db, provider.id as 'bridge'), provider, now: () => new Date(), makeId: () => crypto.randomUUID() },
      conn.id,
      'initial',
    ).then((r) => log('bank_initial_sync', { outcome: r.kind }));
    // @ts-ignore EdgeRuntime est fourni par le runtime Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job);
    else await job;

    return backToApp({ status: 'success', connection: conn.id });
  } catch {
    log('bank_callback_failed', { provider: provider.id });
    return backToApp({ status: 'error' });
  }
});

