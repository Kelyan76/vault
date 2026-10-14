import type { DateStr } from '../domain/dates.ts';
import type { ProviderTransaction, TransactionPage } from './types.ts';

/** Transaction bancaire déjà stockée (vue minimale nécessaire à la fusion). */
export interface StoredBankTransaction {
  id: string;
  providerTransactionId: string;
  providerAccountId: string;
  date: DateStr;
  label: string;
  amountMinor: number;
  currency: string;
  providerCategory: string | null;
  operationType: string | null;
  status: 'booked' | 'pending';
  removed: boolean;
  providerUpdatedAt: string | null;
  syncedAt: string | null;
}

export interface MergeResult {
  inserts: StoredBankTransaction[];
  updates: StoredBankTransaction[];
  /** Opérations marquées retirées (supprimées par le prestataire ou en attente disparues). */
  removals: StoredBankTransaction[];
  unchanged: number;
  /** Doublons reçus dans le même lot, ignorés. */
  duplicatesInBatch: number;
}

export interface MergeOptions {
  now: string;
  makeId: (p: ProviderTransaction) => string;
  /**
   * Fenêtre entièrement re-téléchargée : les opérations « en attente » qui y figuraient
   * et ne sont plus renvoyées sont marquées retirées. À n'utiliser que si le prestataire
   * ne signale pas lui-même les suppressions et que la fenêtre a été lue en entier.
   */
  fullWindow?: { from: DateStr; to: DateStr } | null;
}

function sameContent(a: StoredBankTransaction, p: ProviderTransaction): boolean {
  return (
    a.date === p.date &&
    a.label === p.label &&
    a.amountMinor === p.amountMinor &&
    a.currency === p.currency &&
    a.providerCategory === p.providerCategory &&
    a.operationType === p.operationType &&
    a.status === p.status &&
    a.removed === p.deleted &&
    a.providerAccountId === p.providerAccountId
  );
}

/**
 * Fusion idempotente : la clé est l'identifiant du prestataire.
 * Rejouer le même lot ne crée jamais de doublon et ne modifie rien.
 * Les corrections de catégorie de l'utilisateur vivent dans une autre table et ne sont jamais touchées ici.
 */
export function mergeTransactions(existing: StoredBankTransaction[], incoming: ProviderTransaction[], opts: MergeOptions): MergeResult {
  const byProviderId = new Map(existing.map((t) => [t.providerTransactionId, t]));
  const seen = new Set<string>();
  const result: MergeResult = { inserts: [], updates: [], removals: [], unchanged: 0, duplicatesInBatch: 0 };

  // Si un même identifiant apparaît plusieurs fois, la version la plus récente l'emporte.
  const latest = new Map<string, ProviderTransaction>();
  for (const p of incoming) {
    const prev = latest.get(p.providerTransactionId);
    if (prev) {
      result.duplicatesInBatch++;
      if ((p.providerUpdatedAt ?? '') < (prev.providerUpdatedAt ?? '')) continue;
    }
    latest.set(p.providerTransactionId, p);
  }

  for (const p of latest.values()) {
    seen.add(p.providerTransactionId);
    const current = byProviderId.get(p.providerTransactionId);
    if (!current) {
      if (p.deleted) continue; // jamais vue et déjà supprimée : rien à stocker
      result.inserts.push({ id: opts.makeId(p), ...fromProvider(p), syncedAt: opts.now });
      continue;
    }
    // Une version plus ancienne que celle stockée (webhook rejoué, page en retard) est ignorée.
    if (current.providerUpdatedAt && p.providerUpdatedAt && p.providerUpdatedAt < current.providerUpdatedAt) {
      result.unchanged++;
      continue;
    }
    if (sameContent(current, p)) {
      result.unchanged++;
      continue;
    }
    const next: StoredBankTransaction = { ...current, ...fromProvider(p), syncedAt: opts.now };
    if (p.deleted && !current.removed) result.removals.push(next);
    else result.updates.push(next);
  }

  if (opts.fullWindow) {
    const { from, to } = opts.fullWindow;
    for (const t of existing) {
      if (t.status === 'pending' && !t.removed && !seen.has(t.providerTransactionId) && t.date >= from && t.date <= to) {
        result.removals.push({ ...t, removed: true, syncedAt: opts.now });
      }
    }
  }
  return result;
}

function fromProvider(p: ProviderTransaction): Omit<StoredBankTransaction, 'id' | 'syncedAt'> {
  return {
    providerTransactionId: p.providerTransactionId,
    providerAccountId: p.providerAccountId,
    date: p.date,
    label: p.label,
    amountMinor: p.amountMinor,
    currency: p.currency,
    providerCategory: p.providerCategory,
    operationType: p.operationType,
    status: p.status,
    removed: p.deleted,
    providerUpdatedAt: p.providerUpdatedAt,
  };
}

export function applyMerge(existing: StoredBankTransaction[], merge: MergeResult): StoredBankTransaction[] {
  const map = new Map(existing.map((t) => [t.providerTransactionId, t]));
  for (const t of [...merge.inserts, ...merge.updates, ...merge.removals]) map.set(t.providerTransactionId, t);
  return [...map.values()];
}

/** Marge de recouvrement pour la synchronisation incrémentale : la fusion idempotente absorbe les doublons. */
export const SINCE_OVERLAP_MS = 10 * 60 * 1000;

/** Curseur de la prochaine synchronisation incrémentale. */
export function nextSinceCursor(previous: string | null, received: ProviderTransaction[]): string | null {
  let max = 0;
  for (const p of received) {
    if (p.providerUpdatedAt) max = Math.max(max, new Date(p.providerUpdatedAt).getTime());
  }
  if (!max) return previous;
  const candidate = max - SINCE_OVERLAP_MS;
  // Le curseur n'avance que vers l'avant.
  if (previous && new Date(previous).getTime() >= candidate) return previous;
  return new Date(candidate).toISOString();
}

/** Lit toutes les pages en se protégeant des boucles (curseur répété) et des historiques démesurés. */
export async function collectPages(
  fetchPage: (cursor: string | null) => Promise<TransactionPage>,
  maxPages = 100,
): Promise<{ transactions: ProviderTransaction[]; complete: boolean; pages: number }> {
  const all: ProviderTransaction[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(cursor);
    all.push(...res.transactions);
    if (!res.nextCursor) return { transactions: all, complete: true, pages: page };
    if (cursors.has(res.nextCursor)) throw new Error('Pagination incohérente : curseur répété');
    cursors.add(res.nextCursor);
    cursor = res.nextCursor;
  }
  return { transactions: all, complete: false, pages: maxPages };
}

/** Délai avant nouvelle tentative (exponentiel plafonné) pour une synchronisation échouée. */
export function retryDelayMs(attempt: number): number {
  return Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1));
}
