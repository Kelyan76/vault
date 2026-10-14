// Calculs dérivés de l'état (purs, testés sous Node) : rien n'est stocké en double.
import { classifyAll, type ClassifiedTransaction } from '../../supabase/functions/_shared/domain/aggregation.ts';
import { computeStreak, type StreakInfo } from '../../supabase/functions/_shared/domain/habits.ts';
import { evaluateQuest, questById, type DataQuality, type QuestContext, type QuestEvaluation } from '../../supabase/functions/_shared/domain/quests.ts';
import { goalProgress, type GoalProgress } from '../../supabase/functions/_shared/domain/savings.ts';
import { levelInfo, totalXp, type LevelInfo } from '../../supabase/functions/_shared/domain/xp.ts';
import { DEMO_CATEGORY_MAP } from '../../supabase/functions/_shared/banking/demo.ts';
import { isHealthy } from '../../supabase/functions/_shared/banking/status.ts';
import type { Transaction } from '../../supabase/functions/_shared/domain/transactions.ts';
import type { Space, UserData } from './types.ts';

export function bankTransactionsAsDomain(data: UserData): Transaction[] {
  const accountByProviderId = new Map(data.bank.accounts.map((a) => [a.providerAccountId, a]));
  return data.bank.transactions.map((t) => ({
    id: t.id,
    source: 'demo',
    connectionId: accountByProviderId.get(t.providerAccountId)?.connectionId ?? null,
    accountId: accountByProviderId.get(t.providerAccountId)?.id ?? null,
    providerTransactionId: t.providerTransactionId,
    date: t.date,
    label: t.label,
    amountMinor: t.amountMinor,
    currency: t.currency,
    providerCategory: t.providerCategory,
    operationType: t.operationType,
    status: t.status,
    removed: t.removed,
    providerUpdatedAt: t.providerUpdatedAt,
    syncedAt: t.syncedAt,
    createdAt: t.syncedAt ?? '',
  }));
}

export function allTransactions(data: UserData): ClassifiedTransaction[] {
  const accounts = data.bank.accounts.map((a) => ({ id: a.id, type: a.type }));
  const txs = [...bankTransactionsAsDomain(data), ...data.manualTransactions];
  // La catégorie choisie lors d'une saisie manuelle est enregistrée comme correction de l'utilisateur.
  return classifyAll(txs, {
    accounts,
    overrides: data.overrides,
    ctx: { providerMap: DEMO_CATEGORY_MAP },
  })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function dataQuality(data: UserData, txs: ClassifiedTransaction[], space: Space): DataQuality {
  const live = data.bank.connections.filter((c) => !c.disconnectedAt);
  const spending = txs.filter((t) => t.source !== 'manual' && t.classified.kind === 'expense' && t.status === 'booked');
  const uncategorized = spending.length ? spending.filter((t) => t.classified.category === 'other' && t.classified.source === 'default').length / spending.length : 0;
  if (live.length === 0) {
    return { mode: data.manualTransactions.length ? 'manual' : 'none', coverageFrom: null, lastSyncAt: null, healthy: false, uncategorizedShare: uncategorized };
  }
  return {
    mode: space === 'demo' ? 'demo' : 'bank',
    coverageFrom: live.map((c) => c.firstTransactionDate).filter((d): d is string => !!d).sort()[0] ?? null,
    lastSyncAt: live.map((c) => c.lastSuccessfulSyncAt).filter((d): d is string => !!d).sort()[0] ?? null,
    healthy: live.every((c) => isHealthy(c.status)),
    uncategorizedShare: uncategorized,
  };
}

export function goalsProgress(data: UserData): GoalProgress[] {
  return data.goals.filter((g) => !g.archivedAt).map((g) => goalProgress(g, data.entries));
}

export function questContext(data: UserData, txs: ClassifiedTransaction[], space: Space, today: string): QuestContext {
  return {
    today,
    transactions: txs,
    currency: data.profile.currency,
    entries: data.entries,
    goals: goalsProgress(data),
    budgets: data.budgets,
    habitCompletions: data.habitCompletions,
    weeklyReviews: data.weeklyReviews.map((w) => w.date),
    data: dataQuality(data, txs, space),
  };
}

export function evaluateAll(data: UserData, ctx: QuestContext): Map<string, QuestEvaluation> {
  const out = new Map<string, QuestEvaluation>();
  for (const uq of data.userQuests) {
    const def = questById(uq.questId);
    if (def) out.set(uq.id, evaluateQuest(def, uq, ctx));
  }
  return out;
}

export function progress(data: UserData): LevelInfo {
  return levelInfo(totalXp(data.xpLedger));
}

export function streaks(data: UserData, today: string): Map<string, StreakInfo> {
  return new Map(data.habits.filter((h) => !h.archivedAt).map((h) => [h.id, computeStreak(h, data.habitCompletions, today, data.habitPauses)]));
}
