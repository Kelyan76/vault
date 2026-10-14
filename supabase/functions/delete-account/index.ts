// POST /functions/v1/delete-account   Corps : { confirm: "SUPPRIMER" }
// 1. Supprime l'utilisateur chez chaque prestataire bancaire (révocation de tous les accès et données côté prestataire).
// 2. Supprime l'utilisateur Supabase : toutes les tables privées partent en cascade (testé dans tests/db/rls.test.ts).
// Le journal d'audit est conservé sans lien avec la personne (user_id remis à null).
import { adminClient, corsHeaders, getProvider, json, log, readJson, requireUser } from '../_shared/server/context.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await readJson<{ confirm?: string }>(req);
  if (body?.confirm !== 'SUPPRIMER') return json({ error: 'confirmation_required' }, 400);

  const db = adminClient();
  const { data: providerUsers } = await db.from('bank_provider_users').select('provider, provider_user_id').eq('user_id', user.id);
  const provider = getProvider();
  for (const pu of providerUsers ?? []) {
    if (!provider || provider.id !== pu.provider) return json({ error: 'provider_not_configured' }, 503);
    try {
      await provider.deleteUser(pu.provider_user_id);
    } catch {
      log('account_delete_provider_failed', { provider: pu.provider });
      return json({ error: 'revocation_failed' }, 502);
    }
  }
  await db.rpc('audit', { p_user: user.id, p_action: 'account.deleted', p_target: null, p_meta: {} });
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ error: 'delete_failed' }, 500);
  log('account_deleted', {});
  return json({ ok: true });
});
