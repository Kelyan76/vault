import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSync, type ConnectionRecord, type SyncRepository } from '../supabase/functions/_shared/banking/orchestrator.ts';
import type { StoredBankTransaction } from '../supabase/functions/_shared/banking/sync.ts';
import { ProviderError, type BankingProvider, type ConnectionStatus, type ProviderAccount, type ProviderTransaction } from '../supabase/functions/_shared/banking/types.ts';

function memoryRepo(conn: Partial<ConnectionRecord> = {}) {
  const state = {
    conn: { id: 'c1', userId: 'u1', providerConnectionId: 'item1', status: 'connected' as ConnectionStatus, syncCursor: null as string | null, disconnectedAt: null as string | null, ...conn },
    running: false,
    jobs: [] as { status: string; errorCode?: string; inserted: number }[],
    accounts: [] as ProviderAccount[],
    txs: new Map<string, StoredBankTransaction>(),
    lastSync: null as string | null,
  };
  const repo: SyncRepository = {
    getConnection: async (id) => (id === state.conn.id ? { ...state.conn } : null),
    getProviderUserId: async () => 'pu1',
    beginSync: async () => {
      if (state.running) return null;
      state.running = true;
      return `job${state.jobs.length + 1}`;
    },
    finishSync: async (_id, r) => {
      state.running = false;
      state.jobs.push({ status: r.status, errorCode: r.errorCode, inserted: r.inserted });
    },
    updateConnection: async (_id, patch) => {
      if (patch.status) state.conn.status = patch.status;
      if (patch.syncCursor !== undefined) state.conn.syncCursor = patch.syncCursor;
      if (patch.lastSuccessfulSyncAt) state.lastSync = patch.lastSuccessfulSyncAt;
    },
    upsertAccounts: async (_c, a) => {
      state.accounts = a;
    },
    loadTransactions: async (_c, ids) => ids.map((i) => state.txs.get(i)).filter((x): x is StoredBankTransaction => !!x),
    loadPendingInWindow: async (_c, from, to) => [...state.txs.values()].filter((t) => t.status === 'pending' && !t.removed && t.date >= from && t.date <= to),
    saveTransactions: async (_c, rows) => {
      for (const r of rows) state.txs.set(r.providerTransactionId, r);
    },
    countFailures: async () => state.jobs.filter((j) => j.status === 'failed').length,
  };
  return { repo, state };
}

const account = (id: string, dataAccess = true): ProviderAccount => ({
  providerAccountId: id, providerConnectionId: 'item1', name: id, type: 'checking', balanceMinor: 1000, currency: 'EUR', ibanLast4: null, dataAccess, providerUpdatedAt: null,
});
const ptx = (id: string, account = 'a1', extra: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
  providerTransactionId: id, providerAccountId: account, date: '2026-10-10', label: 'LIDL', amountMinor: -100, currency: 'EUR', providerCategory: null, operationType: null, status: 'booked', deleted: false, providerUpdatedAt: '2026-10-10T10:00:00Z', ...extra,
});

function fakeProvider(opts: { status?: ConnectionStatus; pages?: ProviderTransaction[][]; fail?: ProviderError; accounts?: ProviderAccount[]; reportsDeletions?: boolean } = {}) {
  const calls: { since?: string | null; minDate?: string | null; cursor?: string | null; accountIds?: string[] }[] = [];
  const provider: BankingProvider = {
    id: 'bridge',
    reportsDeletions: opts.reportsDeletions ?? true,
    stateParam: 'context',
    completeCallback: async () => ({ ok: true, providerConnectionId: 'item1' }),
    ensureUser: async () => ({ providerUserId: 'pu1' }),
    createConnectSession: async () => ({ url: 'https://example.test', sessionId: null }),
    getConnection: async () => {
      if (opts.fail) throw opts.fail;
      return { providerConnectionId: 'item1', status: opts.status ?? 'connected', providerStatusCode: '0', institutionName: null, lastSuccessfulSyncAt: null, consentExpiresAt: null };
    },
    listAccounts: async () => opts.accounts ?? [account('a1')],
    listTransactions: async (_u, o) => {
      calls.push(o);
      const pages = opts.pages ?? [[ptx('t1'), ptx('t2')]];
      const idx = o.cursor ? Number(o.cursor) : 0;
      return { transactions: pages[idx], nextCursor: idx + 1 < pages.length ? String(idx + 1) : null };
    },
    deleteConnection: async () => {},
    deleteUser: async () => {},
  };
  return { provider, calls };
}

const deps = (repo: SyncRepository, provider: BankingProvider) => {
  let n = 0;
  return { repo, provider, now: () => new Date('2026-10-14T12:00:00Z'), makeId: () => `id${++n}` };
};

test('première synchronisation : historique de 90 jours, toutes les pages, curseur posé', async () => {
  const { repo, state } = memoryRepo();
  const { provider, calls } = fakeProvider({ pages: [[ptx('t1')], [ptx('t2')], [ptx('t3', 'a1', { providerUpdatedAt: '2026-10-12T00:00:00Z' })]] });
  const r = await runSync(deps(repo, provider), 'c1', 'initial');
  assert.deepEqual(r, { kind: 'succeeded', inserted: 3, updated: 0, removed: 0, status: 'connected' });
  assert.equal(calls[0].minDate, '2026-07-16');
  assert.equal(calls.length, 3);
  assert.equal(state.conn.syncCursor, '2026-10-11T23:50:00.000Z');
  assert.equal(state.conn.status, 'connected');
  assert.equal(state.lastSync, '2026-10-14T12:00:00.000Z');
});

test('synchronisation incrémentale : utilise le curseur, pas de doublon', async () => {
  const { repo, state } = memoryRepo();
  const { provider } = fakeProvider();
  await runSync(deps(repo, provider), 'c1', 'initial');
  const { provider: p2, calls } = fakeProvider({ pages: [[ptx('t2'), ptx('t4')]] });
  const r = await runSync(deps(repo, p2), 'c1', 'webhook');
  assert.equal(calls[0].since, state.conn.syncCursor);
  assert.equal(calls[0].minDate, null);
  assert.equal(r.kind === 'succeeded' && r.inserted, 1);
  assert.equal(state.txs.size, 3);
});

test('comptes non autorisés et autres connexions ignorés', async () => {
  const { repo, state } = memoryRepo();
  const { provider } = fakeProvider({ accounts: [account('a1'), account('a2', false)], pages: [[ptx('t1', 'a1'), ptx('t2', 'a2'), ptx('t3', 'other-item-account')]] });
  await runSync(deps(repo, provider), 'c1', 'manual');
  assert.deepEqual([...state.txs.keys()], ['t1']);
});

test('consentement expiré : rien n’est importé, statut expliqué', async () => {
  const { repo, state } = memoryRepo();
  const { provider, calls } = fakeProvider({ status: 'consent_expired' });
  const r = await runSync(deps(repo, provider), 'c1', 'scheduled');
  assert.deepEqual(r, { kind: 'skipped', reason: 'needs_user_action' });
  assert.equal(state.conn.status, 'consent_expired');
  assert.equal(calls.length, 0);
});

test('erreur du prestataire : statut d’erreur et nouvelle tentative planifiée', async () => {
  const { repo, state } = memoryRepo();
  const { provider } = fakeProvider({ fail: new ProviderError('down', { retryable: true, httpStatus: 503, code: 'unavailable' }) });
  const r = await runSync(deps(repo, provider), 'c1', 'manual');
  assert.equal(r.kind, 'failed');
  assert.equal(r.kind === 'failed' && r.nextRetryAt, '2026-10-14T12:01:00.000Z');
  assert.equal(state.conn.status, 'sync_error');
  assert.equal(state.running, false);
  const fatal = fakeProvider({ fail: new ProviderError('bad creds', { retryable: false, httpStatus: 401 }) });
  const r2 = await runSync(deps(repo, fatal.provider), 'c1', 'manual');
  assert.equal(r2.kind === 'failed' && r2.nextRetryAt, null);
});

test('verrou : pas de synchronisation simultanée ; connexion révoquée : rien', async () => {
  const { repo, state } = memoryRepo();
  state.running = true;
  assert.deepEqual(await runSync(deps(repo, fakeProvider().provider), 'c1', 'webhook'), { kind: 'skipped', reason: 'locked' });
  const gone = memoryRepo({ status: 'disconnected', disconnectedAt: '2026-10-13T00:00:00Z' });
  assert.deepEqual(await runSync(deps(gone.repo, fakeProvider().provider), 'c1', 'webhook'), { kind: 'skipped', reason: 'disconnected' });
  assert.deepEqual(await runSync(deps(gone.repo, fakeProvider().provider), 'nope', 'webhook'), { kind: 'skipped', reason: 'not_found' });
});

test('prestataire sans signal de suppression : l’opération en attente disparue est retirée, le curseur avance à la date de synchro', async () => {
  const { repo, state } = memoryRepo();
  const first = fakeProvider({ reportsDeletions: false, pages: [[ptx('p1', 'a1', { status: 'pending', date: '2026-10-13' }), ptx('t1')]] });
  await runSync(deps(repo, first.provider), 'c1', 'initial');
  assert.deepEqual(first.calls[0].accountIds, ['a1']);
  assert.equal(state.conn.syncCursor, '2026-10-14T12:00:00.000Z');
  // Le lendemain, la banque ne renvoie plus l'opération en attente : elle est devenue définitive sous un autre identifiant.
  const second = fakeProvider({ reportsDeletions: false, pages: [[ptx('b1', 'a1', { date: '2026-10-13' }), ptx('t1')]] });
  const r = await runSync(deps(repo, second.provider), 'c1', 'manual');
  assert.equal(r.kind === 'succeeded' && r.removed, 1);
  assert.equal(state.txs.get('p1')?.removed, true);
  assert.equal(state.txs.get('b1')?.removed, false);
  assert.equal(second.calls[0].since, '2026-10-14T12:00:00.000Z');
});
