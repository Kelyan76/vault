import { useMemo } from 'react';
import { summarizeSpending, type ClassifiedTransaction } from '@shared/domain/aggregation.ts';
import { addDays, diffDays, periodContaining, previousPeriod, type PeriodKind } from '@shared/domain/dates.ts';
import { budgetStatus } from '@shared/domain/budgets.ts';
import { allTransactions, dataQuality, evaluateAll, goalsProgress, progress, questContext, streaks } from './derive';
import { useStore } from './store';
import { useServerBank } from '@/features/bank/serverBank';
import { useBank } from '@/features/bank/useBank';
import { fuelRemaining, groceryRemainingMinor } from '@shared/domain/forecast.ts';
import { projectEndOfMonth } from '@shared/domain/projection.ts';

export function useTransactions(): ClassifiedTransaction[] {
  const { data } = useStore();
  const server = useServerBank().data;
  return useMemo(() => allTransactions(data, server), [data, server]);
}

export function useDataQuality() {
  const { data, space } = useStore();
  const server = useServerBank().data;
  const txs = useTransactions();
  return useMemo(() => dataQuality(data, txs, space, server), [data, txs, space, server]);
}

export function useProgress() {
  const { data } = useStore();
  return useMemo(() => progress(data), [data]);
}

export function useGoals() {
  const { data } = useStore();
  return useMemo(() => goalsProgress(data), [data]);
}

export function useQuestEvaluations() {
  const { data, space, today } = useStore();
  const server = useServerBank().data;
  const txs = useTransactions();
  return useMemo(() => evaluateAll(data, questContext(data, txs, space, today, server)), [data, txs, space, today, server]);
}

export function useStreaks() {
  const { data, today } = useStore();
  return useMemo(() => streaks(data, today), [data, today]);
}

export function useSpending(kind: PeriodKind, offset = 0) {
  const { data, today } = useStore();
  const txs = useTransactions();
  return useMemo(() => {
    let period = periodContaining(today, kind);
    for (let i = 0; i < offset; i++) period = previousPeriod(period, kind);
    const current = summarizeSpending(txs, period, data.profile.currency);
    const prevPeriod = previousPeriod(period, kind);
    const previous = summarizeSpending(txs, prevPeriod, data.profile.currency);
    // Comparaison honnête : même nombre de jours écoulés dans la période précédente.
    const elapsed = Math.max(0, Math.min(diffDays(today, period.from), diffDays(period.to, period.from)));
    const toDateEnd = addDays(prevPeriod.from, Math.min(elapsed, diffDays(prevPeriod.to, prevPeriod.from)));
    const previousToDate = summarizeSpending(txs, { from: prevPeriod.from, to: toDateEnd }, data.profile.currency);
    const budgets = data.budgets
      .filter((b) => b.period === kind && b.currency === data.profile.currency)
      .map((b) => budgetStatus(b, current))
      .sort((a, b) => b.ratio - a.ratio);
    return { period, current, previous, previousToDate: offset === 0 ? previousToDate : previous, budgets };
  }, [txs, today, kind, offset, data.budgets, data.profile.currency]);
}

/**
 * Solde actuel (comptes courants et cartes de la devise du profil) et solde prévu en fin de mois.
 * null si aucun compte bancaire ne donne de solde.
 */
export function useProjection() {
  const { data, today } = useStore();
  const bank = useBank();
  const txs = useTransactions();
  const quality = useDataQuality();
  return useMemo(() => {
    const cur = data.profile.currency;
    const live = new Set(bank.connections.filter((c) => !c.disconnectedAt).map((c) => c.id));
    const accounts = bank.accounts.filter((a) => live.has(a.connectionId) && a.currency === cur && a.balanceMinor !== null);
    const daily = accounts.filter((a) => a.type === 'checking' || a.type === 'card');
    const used = daily.length ? daily : accounts;
    if (!used.length) return null;
    const balance = used.reduce((s, a) => s + (a.balanceMinor ?? 0), 0);
    const ids = new Set(used.map((a) => a.id));
    // Courses et carburant : seulement ce qui reste à dépenser d'ici la fin du mois, à partir d'aujourd'hui.
    const fuelLeft = data.forecast ? fuelRemaining(data.forecast.fuel, today) : null;
    const forecastRemaining = data.forecast ? { groceriesMinor: groceryRemainingMinor(data.forecast.grocery, today), fuelMinor: fuelLeft!.costMinor } : null;
    const projection = projectEndOfMonth({
      today,
      balanceMinor: balance,
      currency: cur,
      // Seulement les opérations des comptes pris en compte dans le solde.
      transactions: txs.filter((t) => t.source === 'manual' || (t.accountId ? ids.has(t.accountId) : false)),
      coverageFrom: quality.coverageFrom,
      forecastRemaining,
      fixedItems: data.fixedItems ?? [],
    });
    return { ...projection, fuelLeft, accounts: used.length, lastSyncAt: bank.connections.map((c) => c.lastSyncAt).filter(Boolean).sort()[0] ?? null };
  }, [data.profile.currency, data.forecast, data.fixedItems, bank.accounts, bank.connections, txs, quality.coverageFrom, today]);
}
