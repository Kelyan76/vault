import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { EnableBankingProvider, mapEbTransactions, mapSessionStatus } from '../supabase/functions/_shared/banking/enablebanking.ts';
import { pemToPkcs8 } from '../supabase/functions/_shared/banking/jwt.ts';
import { collectPages } from '../supabase/functions/_shared/banking/sync.ts';
import { ProviderError } from '../supabase/functions/_shared/banking/types.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const NOW = new Date('2026-10-15T10:00:00Z');

type Route = (url: URL, init: RequestInit) => { status: number; body?: unknown };

function fake(routes: Record<string, Route>) {
  const calls: { method: string; url: URL; auth: string; body?: unknown }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const headers = init.headers as Record<string, string>;
    calls.push({ method: init.method!, url: u, auth: headers.authorization, body: init.body ? JSON.parse(init.body as string) : undefined });
    const route = routes[`${init.method} ${u.pathname}`];
    if (!route) return new Response('{"message":"not found","error":"NOT_FOUND"}', { status: 404 });
    const r = route(u, init);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const provider = (routes: Record<string, Route>) => {
  const f = fake(routes);
  return { eb: new EnableBankingProvider({ applicationId: 'app-123', privateKeyPem: PEM, fetchImpl: f.impl, now: () => NOW }), calls: f.calls };
};

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

test('JWT RS256 : en-tête, revendications et signature vérifiable avec la clé publique', async () => {
  const { eb, calls } = provider({ 'GET /aspsps': () => ({ status: 200, body: { aspsps: [{ name: 'Banque B', country: 'FR' }, { name: 'Banque A', country: 'FR' }] } }) });
  const list = await eb.listInstitutions('FR');
  assert.deepEqual(list.map((b) => b.name), ['Banque A', 'Banque B']);
  const jwt = calls[0].auth.replace('Bearer ', '');
  const [h, p, sig] = jwt.split('.');
  assert.deepEqual(decode(h), { typ: 'JWT', alg: 'RS256', kid: 'app-123' });
  const claims = decode(p);
  assert.equal(claims.iss, 'enablebanking.com');
  assert.equal(claims.aud, 'api.enablebanking.com');
  assert.ok(claims.exp - claims.iat <= 86400);
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, 'base64url'));
  assert.equal(ok, true);
  assert.equal(calls[0].url.searchParams.get('country'), 'FR');
  // Jeton réutilisé tant qu'il est valide.
  await eb.listInstitutions('FR');
  assert.equal(calls[1].auth, calls[0].auth);
});

test('clé privée : formats acceptés et refusés', () => {
  assert.ok(pemToPkcs8(PEM.replace(/\n/g, '\\n')).length > 100);
  assert.throws(() => pemToPkcs8('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'), /PKCS#1/);
  assert.throws(() => new EnableBankingProvider({ applicationId: '', privateKeyPem: '' }), /non configuré/);
});

test('début du consentement : banque choisie, 180 jours, state et adresse de retour', async () => {
  const { eb, calls } = provider({ 'POST /auth': () => ({ status: 200, body: { url: 'https://auth.example/xyz', authorization_id: 'auth-1' } }) });
  const r = await eb.createConnectSession({ providerUserId: 'u', appUserId: 'u', callbackUrl: 'https://p.supabase.co/functions/v1/bank-callback', state: 's'.repeat(48), institution: { name: 'Ma Banque', country: 'FR' } });
  assert.equal(r.url, 'https://auth.example/xyz');
  const body = calls[0].body as { access: { valid_until: string }; aspsp: unknown; state: string; redirect_url: string; psu_type: string };
  assert.deepEqual(body.aspsp, { name: 'Ma Banque', country: 'FR' });
  assert.equal(body.access.valid_until, '2027-04-13T10:00:00.000Z');
  assert.equal(body.state, 's'.repeat(48));
  assert.equal(body.psu_type, 'personal');
  await assert.rejects(eb.createConnectSession({ providerUserId: 'u', appUserId: 'u', callbackUrl: 'x', state: 's' }), /banque/);
});

test('retour du parcours : échange du code, annulation', async () => {
  const { eb, calls } = provider({ 'POST /sessions': () => ({ status: 200, body: { session_id: 'sess-9', accounts: [{ uid: 'acc-1' }] } }) });
  assert.deepEqual(await eb.completeCallback(new URLSearchParams('code=abc&state=s')), { ok: true, providerConnectionId: 'sess-9' });
  assert.deepEqual(calls[0].body, { code: 'abc' });
  assert.deepEqual(await eb.completeCallback(new URLSearchParams('error=access_denied&state=s')), { ok: false, reason: 'cancelled' });
  assert.deepEqual(await eb.completeCallback(new URLSearchParams('state=s')), { ok: false, reason: 'error' });
});

test('états de session', () => {
  assert.equal(mapSessionStatus('AUTHORIZED', '2027-01-01T00:00:00Z', NOW), 'connected');
  assert.equal(mapSessionStatus('AUTHORIZED', '2026-10-01T00:00:00Z', NOW), 'consent_expired');
  assert.equal(mapSessionStatus('EXPIRED', null, NOW), 'consent_expired');
  assert.equal(mapSessionStatus('REVOKED', null, NOW), 'disconnected');
  assert.equal(mapSessionStatus('INVALID', null, NOW), 'action_required');
  assert.equal(mapSessionStatus('RETURNED_FROM_BANK', null, NOW), 'syncing');
});

test('comptes : détails, solde prioritaire, solde indisponible, IBAN masqué', async () => {
  const { eb } = provider({
    'GET /sessions/sess-9': () => ({ status: 200, body: { status: 'AUTHORIZED', access: { valid_until: '2027-04-13T10:00:00Z' }, aspsp: { name: 'Ma Banque', country: 'FR' }, accounts: ['acc-1', 'acc-2'] } }),
    'GET /accounts/acc-1/details': () => ({ status: 200, body: { name: 'Compte courant', currency: 'EUR', cash_account_type: 'CACC', account_id: { iban: 'FR76 3000 6000 0112 3456 7890 189' } } }),
    'GET /accounts/acc-1/balances': () => ({ status: 200, body: { balances: [{ balance_amount: { amount: '99.00', currency: 'EUR' }, balance_type: 'XPCD' }, { balance_amount: { amount: '1234.56', currency: 'EUR' }, balance_type: 'CLBD' }] } }),
    'GET /accounts/acc-2/details': () => ({ status: 200, body: { product: 'Livret A', currency: 'EUR', cash_account_type: 'SVGS' } }),
    'GET /accounts/acc-2/balances': () => ({ status: 500, body: { message: 'bank down' } }),
  });
  const conn = await eb.getConnection('u', 'sess-9');
  assert.deepEqual([conn.status, conn.institutionName, conn.consentExpiresAt], ['connected', 'Ma Banque', '2027-04-13T10:00:00Z']);
  const accounts = await eb.listAccounts('u', 'sess-9');
  assert.deepEqual(accounts.map((a) => [a.name, a.type, a.balanceMinor, a.ibanLast4]), [
    ['Compte courant', 'checking', 123456, '0189'],
    ['Livret A', 'savings', null, null],
  ]);
});

test('transactions : sens, statuts, identifiants de repli stables, pagination sur plusieurs comptes', async () => {
  const pages: Record<string, { transactions: unknown[]; continuation_key?: string }> = {
    'acc-1:': {
      transactions: [
        { transaction_id: 'T1', transaction_amount: { amount: '12.30', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-10-10', remittance_information: ['CB LIDL 09/10'] },
        { transaction_amount: { amount: '5.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: '2026-10-14', creditor: { name: 'BOULANGERIE' } },
        { transaction_amount: { amount: '5.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: '2026-10-14', creditor: { name: 'BOULANGERIE' } },
      ],
      continuation_key: 'k2',
    },
    'acc-1:k2': { transactions: [{ entry_reference: 'E7', transaction_amount: { amount: '1650', currency: 'EUR' }, credit_debit_indicator: 'CRDT', status: 'BOOK', booking_date: '2026-10-01', debtor: { name: 'EMPLOYEUR' } }] },
    'acc-2:': { transactions: [{ transaction_id: 'X', transaction_amount: { amount: '3', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'CNCL', booking_date: '2026-10-12' }] },
  };
  const { eb, calls } = provider({
    'GET /accounts/acc-1/transactions': (u) => ({ status: 200, body: pages[`acc-1:${u.searchParams.get('continuation_key') ?? ''}`] }),
    'GET /accounts/acc-2/transactions': () => ({ status: 200, body: pages['acc-2:'] }),
  });
  const r = await collectPages((cursor) => eb.listTransactions('u', { cursor, minDate: '2026-07-17', accountIds: ['acc-1', 'acc-2'] }));
  assert.equal(r.complete, true);
  assert.equal(calls[0].url.searchParams.get('date_from'), '2026-07-17');
  const tx = r.transactions;
  assert.deepEqual(tx.map((t) => [t.amountMinor, t.status, t.deleted]), [[-1230, 'booked', false], [-500, 'pending', false], [-500, 'pending', false], [165000, 'booked', false], [-300, 'pending', true]]);
  assert.equal(tx[0].providerTransactionId, 'acc-1:T1');
  assert.equal(tx[0].label, 'CB LIDL 09/10');
  assert.equal(tx[3].label, 'EMPLOYEUR');
  // Deux opérations identiques sans identifiant : deux empreintes différentes, stables d'une lecture à l'autre.
  assert.notEqual(tx[1].providerTransactionId, tx[2].providerTransactionId);
  const again = await mapEbTransactions('acc-1', pages['acc-1:'].transactions as never);
  assert.equal(again[1].providerTransactionId, tx[1].providerTransactionId);
});

test('synchro incrémentale : relecture des 10 jours précédant le curseur', async () => {
  const { eb, calls } = provider({ 'GET /accounts/acc-1/transactions': () => ({ status: 200, body: { transactions: [] } }) });
  await eb.listTransactions('u', { since: '2026-10-14T08:00:00Z', accountIds: ['acc-1'] });
  assert.equal(calls[0].url.searchParams.get('date_from'), '2026-10-04');
});

test('erreurs typées et fermeture de session idempotente', async () => {
  const { eb } = provider({
    'GET /sessions/s1': () => ({ status: 429, body: { message: 'slow down', error: 'RATE_LIMIT' } }),
    'DELETE /sessions/s2': () => ({ status: 200, body: { message: 'OK' } }),
  });
  await assert.rejects(eb.getConnection('u', 's1'), (e: unknown) => e instanceof ProviderError && e.retryable && e.code === 'RATE_LIMIT');
  await eb.deleteConnection('u', 's2');
  await eb.deleteConnection('u', 'inconnue'); // 404 : déjà fermée
});
