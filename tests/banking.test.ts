import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { BridgeProvider, mapBridgeAccount, safeNext } from '../supabase/functions/_shared/banking/bridge.ts';
import { demoTransactions } from '../supabase/functions/_shared/banking/demo.ts';
import { bridgeItemStatus, powensConnectionState } from '../supabase/functions/_shared/banking/status.ts';
import { applyMerge, collectPages, mergeTransactions, nextSinceCursor, retryDelayMs, type StoredBankTransaction } from '../supabase/functions/_shared/banking/sync.ts';
import { ProviderError, type ProviderTransaction } from '../supabase/functions/_shared/banking/types.ts';
import { isFreshEvent, verifyBridgeSignature, verifyPowensSignature } from '../supabase/functions/_shared/banking/webhooks.ts';

const p = (id: string, extra: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
  providerTransactionId: id,
  providerAccountId: 'acc',
  date: '2026-10-10',
  label: 'LIDL',
  amountMinor: -1000,
  currency: 'EUR',
  providerCategory: null,
  operationType: 'card',
  status: 'booked',
  deleted: false,
  providerUpdatedAt: '2026-10-10T10:00:00Z',
  ...extra,
});
const opts = { now: '2026-10-11T00:00:00Z', makeId: (x: ProviderTransaction) => `c1:${x.providerTransactionId}` };

test('import : rejouer le même lot ne crée aucun doublon', () => {
  const first = mergeTransactions([], [p('1'), p('2')], opts);
  assert.equal(first.inserts.length, 2);
  const stored = applyMerge([], first);
  const second = mergeTransactions(stored, [p('1'), p('2')], opts);
  assert.deepEqual([second.inserts.length, second.updates.length, second.unchanged], [0, 0, 2]);
});

test('import : doublons dans un même lot, la version la plus récente gagne', () => {
  const r = mergeTransactions([], [p('1', { amountMinor: -900, providerUpdatedAt: '2026-10-10T09:00:00Z' }), p('1', { amountMinor: -1000 })], opts);
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].amountMinor, -1000);
  assert.equal(r.duplicatesInBatch, 1);
});

test('opération en attente qui devient définitive avec un autre montant : mise à jour, pas de doublon', () => {
  const stored = applyMerge([], mergeTransactions([], [p('1', { status: 'pending', amountMinor: -2190 })], opts));
  const r = mergeTransactions(stored, [p('1', { status: 'booked', amountMinor: -2050, providerUpdatedAt: '2026-10-11T10:00:00Z' })], opts);
  assert.equal(r.inserts.length, 0);
  assert.equal(r.updates.length, 1);
  const after = applyMerge(stored, r);
  assert.equal(after.length, 1);
  assert.equal(after[0].status, 'booked');
});

test('opération supprimée par le prestataire : marquée retirée, conservée pour l’historique', () => {
  const stored = applyMerge([], mergeTransactions([], [p('1', { status: 'pending' })], opts));
  const r = mergeTransactions(stored, [p('1', { deleted: true, providerUpdatedAt: '2026-10-12T00:00:00Z' })], opts);
  assert.equal(r.removals.length, 1);
  assert.equal(applyMerge(stored, r)[0].removed, true);
  // Jamais vue et déjà supprimée : ignorée.
  assert.equal(mergeTransactions([], [p('9', { deleted: true })], opts).inserts.length, 0);
});

test('opération en attente disparue d’une fenêtre relue entièrement : retirée', () => {
  const stored = applyMerge([], mergeTransactions([], [p('1', { status: 'pending' }), p('2')], opts));
  const r = mergeTransactions(stored, [p('2')], { ...opts, fullWindow: { from: '2026-10-01', to: '2026-10-31' } });
  assert.deepEqual(r.removals.map((t) => t.providerTransactionId), ['1']);
});

test('une version plus ancienne (webhook rejoué) n’écrase pas la version stockée', () => {
  const stored = applyMerge([], mergeTransactions([], [p('1', { amountMinor: -1200, providerUpdatedAt: '2026-10-12T00:00:00Z' })], opts));
  const r = mergeTransactions(stored, [p('1', { amountMinor: -1000, providerUpdatedAt: '2026-10-10T00:00:00Z' })], opts);
  assert.equal(r.updates.length, 0);
});

test('synchronisation incrémentale : curseur avec recouvrement', () => {
  const c = nextSinceCursor(null, [p('1', { providerUpdatedAt: '2026-10-12T10:00:00Z' }), p('2', { providerUpdatedAt: '2026-10-12T11:00:00Z' })]);
  assert.equal(c, '2026-10-12T10:50:00.000Z');
  assert.equal(nextSinceCursor('2026-10-01T00:00:00.000Z', []), '2026-10-01T00:00:00.000Z');
});

test('pagination : toutes les pages, protection contre les boucles', async () => {
  const pages: Record<string, { transactions: ProviderTransaction[]; nextCursor: string | null }> = {
    start: { transactions: [p('1')], nextCursor: 'b' },
    b: { transactions: [p('2')], nextCursor: 'c' },
    c: { transactions: [p('3')], nextCursor: null },
  };
  const r = await collectPages(async (cur) => pages[cur ?? 'start']);
  assert.deepEqual([r.transactions.length, r.complete, r.pages], [3, true, 3]);
  await assert.rejects(collectPages(async () => ({ transactions: [], nextCursor: 'same' })), /curseur répété/);
  const capped = await collectPages(async (cur) => ({ transactions: [], nextCursor: `${Number(cur ?? 0) + 1}` }), 5);
  assert.equal(capped.complete, false);
});

test('états de connexion Bridge et Powens', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  assert.equal(bridgeItemStatus(0, '2027-01-01T00:00:00Z', now), 'connected');
  assert.equal(bridgeItemStatus(0, '2026-10-01T00:00:00Z', now), 'consent_expired');
  assert.equal(bridgeItemStatus(-2, null, now), 'syncing');
  assert.equal(bridgeItemStatus(1010, null, now), 'action_required');
  assert.equal(bridgeItemStatus(1003, null, now), 'sync_error');
  assert.equal(bridgeItemStatus(1009, null, now), 'connected');
  assert.equal(powensConnectionState(null), 'connected');
  assert.equal(powensConnectionState('SCARequired'), 'consent_expired');
  assert.equal(powensConnectionState('wrongpass'), 'action_required');
  assert.equal(powensConnectionState('websiteUnavailable'), 'sync_error');
  assert.ok(retryDelayMs(1) < retryDelayMs(3));
  assert.equal(retryDelayMs(50), 6 * 60 * 60 * 1000);
});

test('compte Bridge : données manquantes et IBAN masqué', () => {
  const a = mapBridgeAccount({ id: 1, item_id: 2, type: 'pea', iban: 'FR76 3000 6000 0112 3456 7890 189' });
  assert.equal(a.balanceMinor, null);
  assert.equal(a.currency, null);
  assert.equal(a.type, 'investment');
  assert.equal(a.ibanLast4, '0189');
});

test('pagination Bridge : un next_uri ne peut pas pointer ailleurs', () => {
  assert.equal(safeNext('/v3/aggregation/transactions?after=x&limit=50', '/v3/aggregation/transactions'), '/v3/aggregation/transactions?after=x&limit=50');
  assert.throws(() => safeNext('https://evil.example/v3/aggregation/transactions?x', '/v3/aggregation/transactions'));
  assert.throws(() => safeNext('/v3/aggregation/users?x', '/v3/aggregation/transactions'));
});

function fakeFetch(routes: Record<string, (init: RequestInit) => { status: number; body?: unknown }>) {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname}`;
    calls.push({ method: init.method!, url, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    const route = routes[key];
    if (!route) return new Response('{"errors":[{"code":"not_found"}]}', { status: 404 });
    const r = route(init);
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test('client Bridge : en-têtes, jeton utilisateur, session Connect et transactions', async () => {
  const { impl, calls } = fakeFetch({
    'POST /v3/aggregation/users': () => ({ status: 201, body: { uuid: 'u-1' } }),
    'POST /v3/aggregation/authorization/token': () => ({ status: 201, body: { access_token: 'tok', expires_at: '2099-01-01T00:00:00Z', user: { uuid: 'u-1' } } }),
    'POST /v3/aggregation/connect-sessions': () => ({ status: 201, body: { id: 's-1', url: 'https://connect.bridgeapi.io/session/s-1' } }),
    'GET /v3/aggregation/transactions': () => ({
      status: 200,
      body: {
        resources: [{ id: 7, clean_description: 'Lidl', provider_description: 'CB LIDL', amount: -12.3, date: '2026-10-10', updated_at: '2026-10-10T10:00:00Z', currency_code: 'EUR', account_id: 3, deleted: false, future: true, category_id: 12 }],
        pagination: { next_uri: null },
      },
    }),
  });
  const bridge = new BridgeProvider({ clientId: 'cid', clientSecret: 'sec', fetchImpl: impl });
  const { providerUserId } = await bridge.ensureUser('app-user-1');
  assert.equal(providerUserId, 'u-1');
  assert.equal(JSON.parse(calls[0].body!).external_user_id, 'app-user-1');
  const s = await bridge.createConnectSession({ providerUserId, appUserId: 'app-user-1', email: 'a@b.fr', callbackUrl: 'vault://bank/callback', state: 'st-1' });
  assert.equal(s.url, 'https://connect.bridgeapi.io/session/s-1');
  const sessionCall = calls.find((c) => c.url.endsWith('/connect-sessions'))!;
  assert.equal(sessionCall.headers['Bridge-Version'], '2025-01-15');
  assert.equal(sessionCall.headers.authorization, 'Bearer tok');
  assert.equal(JSON.parse(sessionCall.body!).context, 'st-1');
  const page = await bridge.listTransactions(providerUserId, { since: '2026-10-01T00:00:00Z' });
  assert.equal(page.transactions[0].amountMinor, -1230);
  assert.equal(page.transactions[0].status, 'pending');
  assert.equal(page.transactions[0].providerCategory, '12');
  assert.ok(calls.at(-1)!.url.includes('since=2026-10-01T00%3A00%3A00Z'));
  // Le jeton est réutilisé tant qu'il est valide.
  assert.equal(calls.filter((c) => c.url.endsWith('/authorization/token')).length, 1);
});

test('client Bridge : erreurs typées, suppression idempotente', async () => {
  const { impl } = fakeFetch({
    'POST /v3/aggregation/authorization/token': () => ({ status: 201, body: { access_token: 'tok', expires_at: '2099-01-01T00:00:00Z' } }),
    'GET /v3/aggregation/items/5': () => ({ status: 503, body: { errors: [{ code: 'unavailable' }] } }),
    'DELETE /v3/aggregation/items/6': () => ({ status: 204 }),
  });
  const bridge = new BridgeProvider({ clientId: 'cid', clientSecret: 'sec', fetchImpl: impl });
  await assert.rejects(bridge.getConnection('u', '5'), (e: unknown) => e instanceof ProviderError && e.retryable && e.code === 'unavailable');
  await bridge.deleteConnection('u', '6');
  await bridge.deleteConnection('u', '404'); // déjà supprimée
  assert.throws(() => new BridgeProvider({ clientId: '', clientSecret: '' }), /non configuré/);
});

test('webhook Bridge : signature v1 vérifiée, rotation du secret, rejet sinon', async () => {
  const body = '{"type":"item.refreshed","timestamp":1}';
  const sig = createHmac('sha256', 'secret-a').update(body).digest('hex').toUpperCase();
  assert.equal(await verifyBridgeSignature(body, `v1=${sig}`, ['secret-a']), true);
  assert.equal(await verifyBridgeSignature(body, `v1=deadbeef,v1=${sig}`, ['secret-a']), true);
  assert.equal(await verifyBridgeSignature(body, `v1=${sig}`, ['autre']), false);
  assert.equal(await verifyBridgeSignature(body + ' ', `v1=${sig}`, ['secret-a']), false);
  assert.equal(await verifyBridgeSignature(body, `v0=${sig}`, ['secret-a']), false);
  assert.equal(await verifyBridgeSignature(body, null, ['secret-a']), false);
});

test('webhook Powens : signature HMAC et fraîcheur', async () => {
  const date = '2026-10-14T10:00:00Z';
  const body = '{"id":1}';
  const signature = createHmac('sha256', 'k').update(`POST./webhooks/powens.${date}.${body}`).digest('base64');
  const req = { method: 'POST', endpoint: '/webhooks/powens', rawBody: body, signature, signatureDate: date };
  assert.equal(await verifyPowensSignature(req, 'k', new Date('2026-10-14T10:01:00Z')), true);
  assert.equal(await verifyPowensSignature(req, 'k', new Date('2026-10-14T11:00:00Z')), false);
  assert.equal(await verifyPowensSignature({ ...req, rawBody: '{}' }, 'k', new Date('2026-10-14T10:01:00Z')), false);
  const now = new Date('2026-10-14T00:00:00Z');
  assert.equal(isFreshEvent(now.getTime() - 1000, now), true);
  assert.equal(isFreshEvent(now.getTime() - 10 * 86_400_000, now), false);
});

test('banque de démonstration : déterministe et couvrant les cas limites', () => {
  const a = demoTransactions('2026-10-14');
  const b = demoTransactions('2026-10-14');
  assert.deepEqual(a, b);
  assert.ok(a.some((t) => t.status === 'pending'));
  assert.ok(a.some((t) => t.currency === 'USD'));
  assert.ok(a.some((t) => t.label.startsWith('REMBOURSEMENT')));
  assert.equal(new Set(a.map((t) => t.providerTransactionId)).size, a.length);
});

const _typecheck: StoredBankTransaction | null = null;
void _typecheck;
