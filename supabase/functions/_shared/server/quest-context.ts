// Construit le contexte d'évaluation d'une quête à partir des lignes Postgres (fonction pure, testée sous Node).
import { classifyAll } from '../domain/aggregation.ts';
import { goalProgress, type SavingsEntry, type SavingsGoal } from '../domain/savings.ts';
import { REVIEW_HABIT_ID, type DataQuality, type QuestContext } from '../domain/quests.ts';
import type { Budget } from '../domain/budgets.ts';
import type { AccountType, CategoryId, Transaction, TransactionKind } from '../domain/transactions.ts';
import { isHealthy } from '../banking/status.ts';
import type { ConnectionStatus } from '../banking/types.ts';

export interface QuestRows {
  today: string;
  currency: string;
  connections: { status: ConnectionStatus; provider: string; last_successful_sync_at: string | null; first_transaction_date: string | null; disconnected_at: string | null }[];
  accounts: { id: string; type: AccountType }[];
  bankTransactions: { id: string; account_id: string | null; booking_date: string; label: string; amount_minor: number | string; currency: string; provider_category: string | null; status: 'booked' | 'pending'; removed: boolean; source: 'bank' | 'demo'; created_at: string }[];
  overrides: { bank_transaction_id: string; category: CategoryId | null; kind: TransactionKind | null; updated_at: string }[];
  manualTransactions: { id: string; booking_date: string; label: string; amount_minor: number | string; currency: string; category: CategoryId; kind: TransactionKind; created_at: string }[];
  savingsEntries: { id: string; kind: 'declared' | 'observed_transfer'; amount_minor: number | string; currency: string; entry_date: string; source_transaction_id: string | null; created_at: string; updated_at: string }[];
  allocations: { savings_transaction_id: string; goal_id: string; amount_minor: number | string }[];
  goals: { id: string; name: string; target_minor: number | string; currency: string; deadline: string | null; icon: SavingsGoal['icon']; created_at: string; archived_at: string | null }[];
  budgets: { category: CategoryId; limit_minor: number | string; period: 'week' | 'month'; currency: string; id: string }[];
  habitCompletions: { habit_template: string | null; habit_id: string; completed_on: string }[];
  weeklyReviews: { created_at: string }[];
}

export function buildQuestContext(rows: QuestRows): QuestContext {
  const live = rows.connections.filter((c) => !c.disconnected_at);
  const bankTx: Transaction[] = rows.bankTransactions.map((t) => ({
    id: t.id,
    source: t.source,
    accountId: t.account_id,
    date: t.booking_date,
    label: t.label,
    amountMinor: Number(t.amount_minor),
    currency: t.currency,
    providerCategory: t.provider_category,
    status: t.status,
    removed: t.removed,
    createdAt: t.created_at,
  }));
  // Les saisies manuelles portent déjà leur catégorie : on la transmet comme correction utilisateur.
  const manualTx: Transaction[] = rows.manualTransactions.map((t) => ({
    id: `manual:${t.id}`,
    source: 'manual',
    date: t.booking_date,
    label: t.label,
    amountMinor: Number(t.amount_minor),
    currency: t.currency,
    status: 'booked',
    createdAt: t.created_at,
  }));
  const overrides = [
    ...rows.overrides.map((o) => ({ transactionId: o.bank_transaction_id, category: o.category ?? undefined, kind: o.kind ?? undefined, updatedAt: o.updated_at })),
    ...rows.manualTransactions.map((t) => ({ transactionId: `manual:${t.id}`, category: t.category, kind: t.kind, updatedAt: t.created_at })),
  ];
  const transactions = classifyAll([...bankTx, ...manualTx], { accounts: rows.accounts, overrides });

  const entries: SavingsEntry[] = rows.savingsEntries.map((e) => ({
    id: e.id,
    kind: e.kind,
    amountMinor: Number(e.amount_minor),
    currency: e.currency,
    date: e.entry_date,
    sourceTransactionId: e.source_transaction_id,
    allocations: rows.allocations.filter((a) => a.savings_transaction_id === e.id).map((a) => ({ goalId: a.goal_id, amountMinor: Number(a.amount_minor) })),
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  }));
  const goals = rows.goals
    .filter((g) => !g.archived_at)
    .map((g) => goalProgress({ id: g.id, name: g.name, targetMinor: Number(g.target_minor), currency: g.currency, deadline: g.deadline, icon: g.icon, createdAt: g.created_at }, entries));

  const budgets: Budget[] = rows.budgets.map((b) => ({ id: b.id, category: b.category, limitMinor: Number(b.limit_minor), currency: b.currency, period: b.period }));

  const spending = transactions.filter((t) => t.source !== 'manual' && t.classified.kind === 'expense' && t.status === 'booked');
  const uncategorized = spending.length ? spending.filter((t) => t.classified.category === 'other' && t.classified.source === 'default').length / spending.length : 0;
  const real = live.filter((c) => c.provider !== 'demo');
  const demo = live.filter((c) => c.provider === 'demo');
  const pool = real.length ? real : demo;
  const coverage = pool.map((c) => c.first_transaction_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const lastSync = pool.map((c) => c.last_successful_sync_at).filter((d): d is string => !!d).sort()[0] ?? null; // la plus ancienne : toutes les banques doivent être à jour
  const data: DataQuality = {
    mode: real.length ? 'bank' : demo.length ? 'demo' : rows.manualTransactions.length ? 'manual' : 'none',
    coverageFrom: coverage,
    lastSyncAt: lastSync,
    healthy: pool.length > 0 && pool.every((c) => isHealthy(c.status)),
    uncategorizedShare: uncategorized,
  };

  return {
    today: rows.today,
    transactions,
    currency: rows.currency,
    entries,
    goals,
    budgets,
    habitCompletions: rows.habitCompletions.map((h) => ({ habitId: h.habit_template === 'check-budget' ? REVIEW_HABIT_ID : h.habit_id, date: h.completed_on })),
    weeklyReviews: rows.weeklyReviews.map((w) => w.created_at.slice(0, 10)),
    data,
  };
}
