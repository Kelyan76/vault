import { mergeTransactions, nextSinceCursor, collectPages, type StoredBankTransaction } from './sync.ts';
import { isHealthy } from './status.ts';
import { ProviderError, type BankingProvider, type ConnectionStatus, type ProviderAccount } from './types.ts';

// Orchestration d'une synchronisation, indépendante de la base (le dépôt est injecté) :
// la même logique tourne dans l'Edge Function et dans les tests Node.

export interface ConnectionRecord {
  id: string;
  userId: string;
  providerConnectionId: string;
  status: ConnectionStatus;
  syncCursor: string | null;
  disconnectedAt: string | null;
}

export interface SyncRepository {
  getConnection(id: string): Promise<ConnectionRecord | null>;
  getProviderUserId(userId: string): Promise<string | null>;
  /** Verrou : renvoie null si une synchronisation tourne déjà. */
  beginSync(connectionId: string, trigger: SyncTrigger): Promise<string | null>;
  finishSync(jobId: string, result: { status: 'succeeded' | 'failed'; inserted: number; updated: number; removed: number; errorCode?: string; nextRetryAt?: string | null }): Promise<void>;
  updateConnection(id: string, patch: Partial<{ status: ConnectionStatus; providerStatusCode: string | null; consentExpiresAt: string | null; lastSuccessfulSyncAt: string | null; syncCursor: string | null; institutionName: string | null }>): Promise<void>;
  upsertAccounts(connection: ConnectionRecord, accounts: ProviderAccount[], now: string): Promise<void>;
  loadTransactions(connectionId: string, providerTransactionIds: string[]): Promise<StoredBankTransaction[]>;
  saveTransactions(connection: ConnectionRecord, rows: StoredBankTransaction[]): Promise<void>;
  countFailures(connectionId: string): Promise<number>;
}

export type SyncTrigger = 'initial' | 'manual' | 'webhook' | 'scheduled' | 'retry';

export type SyncOutcome =
  | { kind: 'skipped'; reason: 'locked' | 'disconnected' | 'not_found' | 'needs_user_action' }
  | { kind: 'succeeded'; inserted: number; updated: number; removed: number; status: ConnectionStatus }
  | { kind: 'failed'; errorCode: string; retryable: boolean; nextRetryAt: string | null };

/** Historique demandé lors de la première synchronisation. */
export const INITIAL_HISTORY_DAYS = 90;

export async function runSync(
  deps: { repo: SyncRepository; provider: BankingProvider; now: () => Date; makeId: () => string },
  connectionId: string,
  trigger: SyncTrigger,
): Promise<SyncOutcome> {
  const { repo, provider } = deps;
  const conn = await repo.getConnection(connectionId);
  if (!conn) return { kind: 'skipped', reason: 'not_found' };
  if (conn.disconnectedAt || conn.status === 'disconnected') return { kind: 'skipped', reason: 'disconnected' };
  const providerUserId = await repo.getProviderUserId(conn.userId);
  if (!providerUserId) return { kind: 'skipped', reason: 'not_found' };

  const jobId = await repo.beginSync(conn.id, trigger);
  if (!jobId) return { kind: 'skipped', reason: 'locked' };

  const nowIso = deps.now().toISOString();
  try {
    const remote = await provider.getConnection(providerUserId, conn.providerConnectionId);
    await repo.updateConnection(conn.id, {
      status: remote.status === 'connected' ? 'syncing' : remote.status,
      providerStatusCode: remote.providerStatusCode,
      consentExpiresAt: remote.consentExpiresAt,
      institutionName: remote.institutionName,
    });
    if (!isHealthy(remote.status)) {
      // Consentement expiré ou action requise : on n'importe rien et on explique quoi faire.
      await repo.updateConnection(conn.id, { status: remote.status });
      await repo.finishSync(jobId, { status: 'failed', inserted: 0, updated: 0, removed: 0, errorCode: `status_${remote.status}` });
      return { kind: 'skipped', reason: 'needs_user_action' };
    }

    const accounts = await provider.listAccounts(providerUserId, conn.providerConnectionId);
    await repo.upsertAccounts(conn, accounts, nowIso);
    const accountIds = new Set(accounts.filter((a) => a.dataAccess).map((a) => a.providerAccountId));

    const minDate = conn.syncCursor ? null : new Date(deps.now().getTime() - INITIAL_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const pages = await collectPages((cursor) => provider.listTransactions(providerUserId, { since: conn.syncCursor, cursor, minDate }));
    // Les transactions de l'utilisateur chez le prestataire peuvent concerner d'autres connexions : on ne garde que celles-ci.
    const incoming = pages.transactions.filter((t) => accountIds.has(t.providerAccountId));
    const existing = await repo.loadTransactions(conn.id, [...new Set(incoming.map((t) => t.providerTransactionId))]);
    const merge = mergeTransactions(existing, incoming, { now: nowIso, makeId: deps.makeId });
    await repo.saveTransactions(conn, [...merge.inserts, ...merge.updates, ...merge.removals]);

    const cursor = pages.complete ? nextSinceCursor(conn.syncCursor, incoming) : conn.syncCursor;
    await repo.updateConnection(conn.id, { status: 'connected', lastSuccessfulSyncAt: nowIso, syncCursor: cursor });
    await repo.finishSync(jobId, { status: 'succeeded', inserted: merge.inserts.length, updated: merge.updates.length, removed: merge.removals.length });
    return { kind: 'succeeded', inserted: merge.inserts.length, updated: merge.updates.length, removed: merge.removals.length, status: 'connected' };
  } catch (e) {
    const retryable = e instanceof ProviderError ? e.retryable : true;
    const code = e instanceof ProviderError ? e.code : 'internal_error';
    const failures = (await repo.countFailures(conn.id)) + 1;
    const nextRetryAt = retryable && failures < 6 ? new Date(deps.now().getTime() + Math.min(6 * 3600_000, 60_000 * 2 ** (failures - 1))).toISOString() : null;
    await repo.updateConnection(conn.id, { status: 'sync_error' });
    await repo.finishSync(jobId, { status: 'failed', inserted: 0, updated: 0, removed: 0, errorCode: code, nextRetryAt });
    return { kind: 'failed', errorCode: code, retryable, nextRetryAt };
  }
}
