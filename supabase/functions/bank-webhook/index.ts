// POST /functions/v1/bank-webhook  (appelé par Bridge, sans JWT)
// Authenticité : en-tête BridgeApi-Signature (HMAC-SHA256 du corps brut, schéma v1).
// Rejeu : chaque corps est haché et enregistré ; un événement déjà vu est ignoré.
import { adminClient, getProvider, json, log } from '../_shared/server/context.ts';
import { supabaseSyncRepository } from '../_shared/server/sync-repository.ts';
import { runSync } from '../_shared/banking/orchestrator.ts';
import { isFreshEvent, verifyBridgeSignature } from '../_shared/banking/webhooks.ts';

interface BridgeEvent {
  type: string;
  timestamp: number;
  content: { item_id?: number; user_uuid?: string; account_id?: number };
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const raw = await req.text();
  if (raw.length > 100_000) return json({ error: 'too_large' }, 413);

  // Deux secrets possibles pendant une rotation (séparés par des virgules).
  const secrets = (Deno.env.get('BRIDGE_WEBHOOK_SECRETS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!(await verifyBridgeSignature(raw, req.headers.get('BridgeApi-Signature'), secrets))) {
    log('webhook_rejected', { reason: 'signature' });
    return json({ error: 'invalid_signature' }, 401);
  }
  let event: BridgeEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  if (!isFreshEvent(event.timestamp, new Date())) return json({ ignored: 'stale' });

  const db = adminClient();
  const { error: dup } = await db.from('webhook_events').insert({ provider: 'bridge', event_hash: await sha256Hex(raw), event_type: event.type });
  if (dup) return json({ ignored: 'duplicate' }); // clé primaire déjà présente

  const provider = getProvider();
  const itemId = event.content.item_id != null ? String(event.content.item_id) : null;
  const { data: conn } = itemId
    ? await db.from('bank_connections').select('id').eq('provider', 'bridge').eq('provider_connection_id', itemId).maybeSingle()
    : { data: null };

  switch (event.type) {
    case 'item.refreshed':
    case 'item.account.updated':
    case 'item.account.created':
    case 'item.account.deleted':
      if (conn && provider) {
        const job = runSync({ repo: supabaseSyncRepository(db, 'bridge'), provider, now: () => new Date(), makeId: () => crypto.randomUUID() }, conn.id, 'webhook').then((r) =>
          log('webhook_sync', { type: event.type, outcome: r.kind }),
        );
        // @ts-ignore EdgeRuntime est fourni par le runtime Supabase
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job);
        else await job;
      }
      break;
    case 'item.deleted':
      if (conn) await db.rpc('finalize_bank_disconnection', { p_connection: conn.id, p_delete_data: false });
      break;
    case 'user.deleted': {
      const { data: pu } = await db.from('bank_provider_users').select('user_id').eq('provider', 'bridge').eq('provider_user_id', event.content.user_uuid ?? '').maybeSingle();
      if (pu) {
        const { data: conns } = await db.from('bank_connections').select('id').eq('user_id', pu.user_id).eq('provider', 'bridge');
        for (const c of conns ?? []) await db.rpc('finalize_bank_disconnection', { p_connection: c.id, p_delete_data: false });
        await db.from('bank_provider_users').delete().eq('user_id', pu.user_id).eq('provider', 'bridge');
      }
      break;
    }
    default:
      break;
  }
  await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', 'bridge').eq('event_hash', await sha256Hex(raw));
  return json({ ok: true });
});
