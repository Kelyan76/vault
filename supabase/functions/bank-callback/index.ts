// GET /functions/v1/bank-callback  (URL de retour du parcours prestataire, sans JWT)
// Notre `state` revient dans `context` (Bridge) ou `state` (Enable Banking). Il est à usage unique et relie le
// retour à l'utilisateur. L'adaptateur interprète le reste (item_id chez Bridge, code à échanger chez Enable Banking),
// puis la connexion est relue chez le prestataire avant d'être enregistrée, et l'appli est rouverte via son lien profond.
import { adminClient, getProvider, log } from '../_shared/server/context.ts';
import { supabaseSyncRepository } from '../_shared/server/sync-repository.ts';
import { runSync } from '../_shared/banking/orchestrator.ts';
import { parseOrigins, safeReturnUrl, withParams } from '../_shared/banking/return-url.ts';

function redirect(base: string, params: Record<string, string>): Response {
  return new Response(null, { status: 302, headers: { location: withParams(base, params) } });
}

Deno.serve(async (req) => {
  // Adresse de retour propre à cette requête : celle transmise par l'appli à bank-connect, sinon celle par défaut.
  let returnBase = safeReturnUrl(Deno.env.get('APP_RETURN_URL')) ?? 'vault://bank/callback';
  const backToApp = (params: Record<string, string>) => redirect(returnBase, params);
  const url = new URL(req.url);
  const state = url.searchParams.get('state') ?? url.searchParams.get('context');
  if (!state || !/^[a-f0-9]{48}$/.test(state)) return backToApp({ status: 'invalid' });

  const db = adminClient();
  const { data: attempt } = await db.from('bank_connect_attempts').select('*').eq('state', state).maybeSingle();
  if (attempt?.return_url && safeReturnUrl(attempt.return_url, parseOrigins(Deno.env.get('ALLOWED_RETURN_ORIGINS')))) returnBase = attempt.return_url;
  if (!attempt || attempt.consumed_at || new Date(attempt.expires_at).getTime() < Date.now()) return backToApp({ status: 'expired' });
  // Usage unique du `state` (protection contre le rejeu).
  const { data: consumed } = await db.from('bank_connect_attempts').update({ consumed_at: new Date().toISOString() }).eq('state', state).is('consumed_at', null).select('state');
  if (!consumed?.length) return backToApp({ status: 'expired' });

  const provider = getProvider();
  if (!provider || provider.id !== attempt.provider) return backToApp({ status: 'not_configured' });

  const { data: pu } = await db.from('bank_provider_users').select('provider_user_id').eq('user_id', attempt.user_id).eq('provider', provider.id).maybeSingle();
  if (!pu) return backToApp({ status: 'error' });
  const callbackUser = url.searchParams.get('user_uuid');
  if (callbackUser && callbackUser !== pu.provider_user_id) return backToApp({ status: 'error' });

  try {
    const result = await provider.completeCallback(url.searchParams, pu.provider_user_id);
    if (!result.ok) {
      log('bank_callback_cancelled', { provider: provider.id, reason: result.reason });
      return backToApp({ status: result.reason });
    }
    // Vérification : la connexion doit exister chez le prestataire pour cet utilisateur.
    const remote = await provider.getConnection(pu.provider_user_id, result.providerConnectionId);
    const row = {
      user_id: attempt.user_id,
      provider: provider.id,
      provider_connection_id: remote.providerConnectionId,
      status: remote.status === 'connected' ? 'syncing' : remote.status,
      provider_status_code: remote.providerStatusCode,
      consent_expires_at: remote.consentExpiresAt,
      institution_name: remote.institutionName,
      disconnected_at: null,
    };
    // Renouvellement : on met à jour la connexion d'origine (chez Enable Banking, la session change d'identifiant).
    const { data: conn, error } = attempt.connection_id
      ? await db.from('bank_connections').update(row).eq('id', attempt.connection_id).eq('user_id', attempt.user_id).select('id, user_id').single()
      : await db.from('bank_connections').upsert(row, { onConflict: 'provider,provider_connection_id' }).select('id, user_id').single();
    if (error || !conn || conn.user_id !== attempt.user_id) return backToApp({ status: 'error' });

    // Récompense de bienvenue : une seule fois par compte, quelle que soit la banque.
    await db.rpc('award_xp', { p_user: attempt.user_id, p_key: 'first_bank_connection', p_reason: 'first_bank_connection', p_amount: 30, p_label: 'Première connexion bancaire' });
    await db.rpc('audit', { p_user: attempt.user_id, p_action: 'bank.connected', p_target: conn.id, p_meta: {} });

    // Synchronisation initiale en arrière-plan : l'utilisateur revient tout de suite dans l'appli.
    const job = runSync(
      { repo: supabaseSyncRepository(db, provider.id as 'bridge' | 'enablebanking'), provider, now: () => new Date(), makeId: () => crypto.randomUUID() },
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

