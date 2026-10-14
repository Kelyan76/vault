// POST /functions/v1/bank-disconnect   Corps : { connectionId, deleteData: boolean }
// 1. Révoque l'accès chez le prestataire (suppression de l'item : le prestataire cesse toute collecte).
// 2. Marque la connexion « déconnectée » ; si deleteData, supprime comptes et opérations importés.
// Conséquences pour l'utilisateur (affichées dans l'appli) : les quêtes en cours basées sur la banque
// ne peuvent plus être vérifiées automatiquement ; les mises de côté du coffre et l'XP déjà gagnée restent.
import { adminClient, corsHeaders, getProvider, json, log, readJson, requireUser } from '../_shared/server/context.ts';
import { ProviderError } from '../_shared/banking/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await readJson<{ connectionId?: string; deleteData?: boolean }>(req);
  if (!body?.connectionId) return json({ error: 'connection_required' }, 400);

  const db = adminClient();
  const { data: conn } = await db.from('bank_connections').select('id, user_id, provider, provider_connection_id, disconnected_at').eq('id', body.connectionId).maybeSingle();
  if (!conn || conn.user_id !== user.id) return json({ error: 'not_found' }, 404);

  if (!conn.disconnected_at && conn.provider !== 'demo') {
    const provider = getProvider();
    if (!provider || provider.id !== conn.provider) return json({ error: 'provider_not_configured' }, 503);
    const { data: pu } = await db.from('bank_provider_users').select('provider_user_id').eq('user_id', user.id).eq('provider', conn.provider).maybeSingle();
    if (pu) {
      try {
        await provider.deleteConnection(pu.provider_user_id, conn.provider_connection_id);
      } catch (e) {
        log('bank_revoke_failed', { code: e instanceof ProviderError ? e.code : 'internal' });
        // On n'affiche pas « déconnecté » si la révocation n'a pas eu lieu.
        return json({ error: 'revocation_failed', retryable: e instanceof ProviderError ? e.retryable : true }, 502);
      }
    }
  }
  await db.rpc('finalize_bank_disconnection', { p_connection: conn.id, p_delete_data: !!body.deleteData });
  return json({ ok: true, deletedData: !!body.deleteData });
});
