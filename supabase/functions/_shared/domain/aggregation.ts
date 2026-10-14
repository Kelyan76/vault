import { classify, detectInternalTransfers, type ClassifyContext, type Classified } from './categorize.ts';
import { addDays, diffDays, inPeriod, type DateStr, type Period } from './dates.ts';
import { CATEGORY_IDS, type BankAccountRef, type CategoryId, type CategoryOverride, type Transaction } from './transactions.ts';

export interface ClassifiedTransaction extends Transaction {
  classified: Classified;
}

/** Classe toutes les opérations visibles (les opérations retirées par le prestataire sont exclues). */
export function classifyAll(
  txs: Transaction[],
  opts: { accounts?: BankAccountRef[]; overrides?: CategoryOverride[]; ctx?: ClassifyContext } = {},
): ClassifiedTransaction[] {
  const visible = txs.filter((t) => !t.removed);
  const transfers = detectInternalTransfers(visible, opts.accounts ?? []);
  const overrides = new Map((opts.overrides ?? []).map((o) => [o.transactionId, o]));
  return visible.map((t) => ({ ...t, classified: classify(t, { ...opts.ctx, transfers, overrides }) }));
}

export interface CategorySpend {
  category: CategoryId;
  /** Dépense nette (dépenses - remboursements), en unités mineures positives. */
  spentMinor: number;
  pendingMinor: number;
  count: number;
}

export interface SpendingSummary {
  currency: string;
  period: Period;
  totalSpentMinor: number;
  totalIncomeMinor: number;
  /** Mouvements vers l'épargne observés (jambe sortante uniquement). */
  savingsTransferMinor: number;
  pendingMinor: number;
  byCategory: CategorySpend[];
  /** Devises présentes dans la période mais non agrégées dans ce résumé. */
  otherCurrencies: string[];
  transactionCount: number;
}

/**
 * Agrège les dépenses d'une période dans une devise.
 * - les transferts internes ne sont ni des dépenses ni des revenus,
 * - les remboursements réduisent la dépense de leur catégorie (plancher à 0),
 * - les opérations en attente sont comptées à part pour ne pas gonfler les totaux confirmés.
 */
export function summarizeSpending(txs: ClassifiedTransaction[], period: Period, currency: string): SpendingSummary {
  const byCat = new Map<CategoryId, CategorySpend>();
  for (const c of CATEGORY_IDS) byCat.set(c, { category: c, spentMinor: 0, pendingMinor: 0, count: 0 });
  let income = 0;
  let savings = 0;
  let pending = 0;
  let count = 0;
  const others = new Set<string>();

  for (const t of txs) {
    if (!inPeriod(t.date, period)) continue;
    if (t.currency !== currency) {
      others.add(t.currency);
      continue;
    }
    count++;
    const { kind, category } = t.classified;
    const slot = byCat.get(category)!;
    if (t.status === 'pending') {
      if (kind === 'expense') {
        slot.pendingMinor += -t.amountMinor;
        pending += -t.amountMinor;
      }
      continue;
    }
    switch (kind) {
      case 'expense':
        slot.spentMinor += -t.amountMinor;
        slot.count++;
        break;
      case 'refund':
        slot.spentMinor -= t.amountMinor;
        break;
      case 'income':
        income += t.amountMinor;
        break;
      case 'savings_transfer':
        if (t.amountMinor < 0) savings += -t.amountMinor;
        break;
      case 'internal_transfer':
        break;
    }
  }
  const byCategory = [...byCat.values()]
    .map((c) => ({ ...c, spentMinor: Math.max(0, c.spentMinor) }))
    .filter((c) => c.spentMinor > 0 || c.pendingMinor > 0);
  byCategory.sort((a, b) => b.spentMinor - a.spentMinor);
  return {
    currency,
    period,
    totalSpentMinor: byCategory.reduce((s, c) => s + c.spentMinor, 0),
    totalIncomeMinor: income,
    savingsTransferMinor: savings,
    pendingMinor: pending,
    byCategory,
    otherCurrencies: [...others].sort(),
    transactionCount: count,
  };
}

export function spentInCategory(summary: SpendingSummary, category: CategoryId): number {
  return summary.byCategory.find((c) => c.category === category)?.spentMinor ?? 0;
}

export interface PeriodComparison {
  currentMinor: number;
  previousMinor: number;
  /** Variation en %, null si la période précédente est vide (pas de division par zéro trompeuse). */
  changePct: number | null;
}

export function compare(current: number, previous: number): PeriodComparison {
  return {
    currentMinor: current,
    previousMinor: previous,
    changePct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}

/** Série quotidienne des dépenses confirmées, pour les petits graphiques. */
export function dailySpending(txs: ClassifiedTransaction[], period: Period, currency: string): { date: DateStr; spentMinor: number }[] {
  const days = diffDays(period.to, period.from) + 1;
  const series = Array.from({ length: days }, (_, i) => ({ date: addDays(period.from, i), spentMinor: 0 }));
  for (const t of txs) {
    if (t.currency !== currency || t.status !== 'booked' || !inPeriod(t.date, period)) continue;
    const idx = diffDays(t.date, period.from);
    if (t.classified.kind === 'expense') series[idx].spentMinor += -t.amountMinor;
    if (t.classified.kind === 'refund') series[idx].spentMinor -= t.amountMinor;
  }
  return series.map((d) => ({ ...d, spentMinor: Math.max(0, d.spentMinor) }));
}

export function searchTransactions<T extends Transaction>(txs: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return txs;
  return txs.filter((t) => t.label.toLowerCase().includes(q));
}
