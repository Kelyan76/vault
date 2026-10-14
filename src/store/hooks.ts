import { useMemo } from 'react';
import { summarizeSpending, type ClassifiedTransaction } from '@shared/domain/aggregation.ts';
import { addDays, diffDays, periodContaining, previousPeriod, type PeriodKind } from '@shared/domain/dates.ts';
import { budgetStatus } from '@shared/domain/budgets.ts';
import { allTransactions, dataQuality, evaluateAll, goalsProgress, progress, questContext, streaks } from './derive';
import { useStore } from './store';

export function useTransactions(): ClassifiedTransaction[] {
  const { data } = useStore();
  return useMemo(() => allTransactions(data), [data]);
}

export function useDataQuality() {
  const { data, space } = useStore();
  const txs = useTransactions();
  return useMemo(() => dataQuality(data, txs, space), [data, txs, space]);
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
  const txs = useTransactions();
  return useMemo(() => evaluateAll(data, questContext(data, txs, space, today)), [data, txs, space, today]);
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
