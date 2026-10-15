// POST /functions/v1/bank-sync
// - par l'utilisateur : { connectionId } → synchronisation manuelle (au plus une toutes les 5 minutes) ;
// - par une tâche planifiée (pg_cron + clé service_role) : { scheduled: true } → connexions à rafraîchir et reprises.
import { adminClient, corsHeaders, env, getProvider, json, log, readJson, requireUser } from '../_shared/server/context.ts';
import { supabaseSyncRepository } from '../_shared/server/sync-repository.ts';
import { runSync } from '../_shared/banking/orchestrator.ts';
import { timingSafeEqual } from '../_shared/banking/webhooks.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const provider = getProvider();
  if (!provider) return json({ error: 'provider_not_configured' }, 503);
  const db = adminClient();
  const deps = { repo: supabaseSyncRepository(db, provider.id as 'bridge' | 'enablebanking'), provider, now: () => new Date(), makeId: () => crypto.randomUUID() };
  const body = await readJson<{ connectionId?: string; scheduled?: boolean }>(req);

  const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (body?.scheduled) {
    if (!timingSafeEqual(bearer, env('SUPABASE_SERVICE_ROLE_KEY'))) return json({ error: 'unauthorized' }, 401);
    const staleBefore = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data: due } = await db
      .from('bank_connections')
      .select('id')
      .eq('provider', provider.id)
      .is('disconnected_at', null)
      .in('status', ['connected', 'sync_error', 'syncing'])
      .or(`last_successful_sync_at.is.null,last_successful_sync_at.lt.${staleBefore}`)
      .limit(50);
    let ok = 0;
    for (const c of due ?? []) {
      const r = await runSync(deps, c.id, 'scheduled');
      if (r.kind === 'succeeded') ok++;
    }
    log('bank_scheduled_sync', { candidates: due?.length ?? 0, succeeded: ok });
    return json({ candidates: due?.length ?? 0, succeeded: ok });
  }

  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!body?.connectionId) return json({ error: 'connection_required' }, 400);
  const { data: conn } = await db.from('bank_connections').select('user_id, last_sync_attempt_at').eq('id', body.connectionId).maybeSingle();
  if (!conn || conn.user_id !== user.id) return json({ error: 'not_found' }, 404);
  if (conn.last_sync_attempt_at && Date.now() - new Date(conn.last_sync_attempt_at).getTime() < 5 * 60_000) {
    return json({ error: 'too_soon', retryAfterSeconds: 300 }, 429);
  }
  const outcome = await runSync(deps, body.connectionId, 'manual');
  return json(outcome);
});
