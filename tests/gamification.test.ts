import assert from 'node:assert/strict';
import { test } from 'node:test';
import { earnedAchievements } from '../supabase/functions/_shared/domain/achievements.ts';
import { collectiveProgress, leaderboard, sanitizeSharedScore, validatePseudo } from '../supabase/functions/_shared/domain/challenges.ts';
import { computeStreak, type Habit } from '../supabase/functions/_shared/domain/habits.ts';
import {
  estimatedSaving,
  goalProgress,
  savingsTransferSuggestions,
  splitEvenly,
  validateAvoided,
  validateEntry,
  vaultTotals,
  type SavingsEntry,
  type SavingsGoal,
} from '../supabase/functions/_shared/domain/savings.ts';
import { awardXp, levelInfo, totalXp, xpForLevel, xpKeys, type XpEvent } from '../supabase/functions/_shared/domain/xp.ts';
import { classifyAll } from '../supabase/functions/_shared/domain/aggregation.ts';
import { tx } from './helpers.ts';

const ev = (key: string, amount = 20): XpEvent => ({ key, amount, reason: 'weekly_review', at: '2026-10-14T10:00:00Z', label: 'Bilan' });

test('XP : une récompense par événement (idempotence)', () => {
  let ledger: XpEvent[] = [];
  ({ ledger } = awardXp(ledger, ev(xpKeys.weeklyReview('2026-W42'))));
  const again = awardXp(ledger, ev(xpKeys.weeklyReview('2026-W42')));
  assert.equal(again.awarded, false);
  assert.equal(totalXp(again.ledger), 20);
  ({ ledger } = awardXp(ledger, ev(xpKeys.weeklyReview('2026-W43'))));
  assert.equal(totalXp(ledger), 40);
});

test('XP : montants invalides refusés', () => {
  assert.throws(() => awardXp([], ev('k', 0)));
  assert.throws(() => awardXp([], ev('k', 10_000)));
  assert.throws(() => awardXp([], ev('k', 1.5)));
});

test('niveaux : seuils et progression', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 250, 450, 700]);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(99).level, 1);
  assert.equal(levelInfo(100).level, 2);
  const l = levelInfo(175);
  assert.equal(l.level, 2);
  assert.equal(l.progress, 0.5);
});

const goal = (id: string, target = 10000): SavingsGoal => ({ id, name: id, targetMinor: target, currency: 'EUR', icon: 'star', createdAt: '2026-10-01T00:00:00Z' });
const entry = (p: Partial<SavingsEntry> & Pick<SavingsEntry, 'amountMinor' | 'allocations'>): SavingsEntry => ({
  id: p.id ?? Math.random().toString(36),
  kind: 'declared',
  currency: 'EUR',
  date: '2026-10-10',
  createdAt: '',
  updatedAt: '',
  ...p,
});

test('épargne : répartition entre objectifs sans perte de centime', () => {
  const parts = splitEvenly(1001, ['a', 'b', 'c']);
  assert.deepEqual(parts.map((p) => p.amountMinor), [334, 334, 333]);
  assert.equal(parts.reduce((s, p) => s + p.amountMinor, 0), 1001);
  const neg = splitEvenly(-1001, ['a', 'b']);
  assert.equal(neg.reduce((s, p) => s + p.amountMinor, 0), -1001);
});

test('épargne : déclaré et observé distingués, corrections prises en compte', () => {
  const g = goal('voyage');
  const entries = [
    entry({ amountMinor: 3000, allocations: [{ goalId: 'voyage', amountMinor: 3000 }] }),
    entry({ amountMinor: 10000, kind: 'observed_transfer', sourceTransactionId: 'tx1', allocations: [{ goalId: 'voyage', amountMinor: 5000 }] }),
    entry({ amountMinor: -1000, allocations: [{ goalId: 'voyage', amountMinor: -1000 }] }),
  ];
  const p = goalProgress(g, entries);
  assert.equal(p.declaredMinor, 2000);
  assert.equal(p.observedMinor, 5000);
  assert.equal(p.savedMinor, 7000);
  assert.equal(p.reached, false);
  assert.deepEqual(vaultTotals(entries), { EUR: { declaredMinor: 2000, observedMinor: 10000 } });
});

test('épargne : validation des contributions', () => {
  const goals = [goal('a'), { ...goal('usd'), currency: 'USD' }];
  assert.equal(validateEntry({ amountMinor: 100, currency: 'EUR', allocations: [{ goalId: 'a', amountMinor: 200 }] }, goals), 'La répartition dépasse le montant.');
  assert.equal(validateEntry({ amountMinor: 100, currency: 'EUR', allocations: [{ goalId: 'usd', amountMinor: 100 }] }, goals), 'La devise doit être celle de l’objectif.');
  assert.equal(validateEntry({ amountMinor: 100, currency: 'EUR', allocations: [{ goalId: 'a', amountMinor: 60 }] }, goals), null);
});

test('épargne : un virement détecté n’est proposé qu’une fois', () => {
  const accounts = [
    { id: 'cc', type: 'checking' as const },
    { id: 'liv', type: 'savings' as const },
  ];
  const txs = classifyAll(
    [
      tx({ id: 'out', accountId: 'cc', date: '2026-10-10', amountMinor: -5000, label: 'VIR LIVRET' }),
      tx({ id: 'in', accountId: 'liv', date: '2026-10-10', amountMinor: 5000, label: 'VIR' }),
    ],
    { accounts },
  );
  const sugg = savingsTransferSuggestions(txs, []);
  assert.deepEqual(sugg.map((t) => t.id), ['out']);
  const linked = savingsTransferSuggestions(txs, [entry({ amountMinor: 5000, kind: 'observed_transfer', sourceTransactionId: 'out', allocations: [] })]);
  assert.equal(linked.length, 0);
});

test('dépense évitée : estimation séparée du coffre', () => {
  assert.equal(estimatedSaving({ plannedMinor: 2500, actualMinor: 700 }), 1800);
  assert.equal(validateAvoided({ label: 'Pizza', plannedMinor: 1000, actualMinor: 1500 }), 'Le montant dépensé dépasse le montant prévu : rien n’a été évité.');
});

const habit: Habit = { id: 'h', name: 'Vérifier', frequency: 'daily', icon: 'eye', createdAt: '2026-10-01T00:00:00Z' };

test('séries : la journée en cours ne casse pas la série', () => {
  const c = ['2026-10-10', '2026-10-11', '2026-10-12'].map((date) => ({ habitId: 'h', date }));
  const s = computeStreak(habit, c, '2026-10-13');
  assert.equal(s.current, 3);
  assert.equal(s.doneInCurrentSlot, false);
  assert.equal(computeStreak(habit, c, '2026-10-14').current, 0);
  assert.equal(computeStreak(habit, c, '2026-10-14').best, 3);
});

test('séries : une pause ne casse pas la série', () => {
  const c = ['2026-10-05', '2026-10-06', '2026-10-10'].map((date) => ({ habitId: 'h', date }));
  const s = computeStreak(habit, c, '2026-10-10', [{ from: '2026-10-07', to: '2026-10-09' }]);
  assert.equal(s.current, 3);
  assert.equal(s.currentStart, '2026-10-05');
  assert.equal(s.best, 3);
});

test('séries hebdomadaires', () => {
  const weekly: Habit = { ...habit, frequency: 'weekly' };
  const c = ['2026-09-29', '2026-10-07', '2026-10-13'].map((date) => ({ habitId: 'h', date }));
  assert.equal(computeStreak(weekly, c, '2026-10-14').current, 3);
});

test('badges : habitudes, pas richesse', () => {
  const ids = earnedAchievements({ completedQuests: 1, activeDays: ['a', 'b'], goalsReached: 0, bestStreak: 3, completedChallenges: 0, weeklyReviews: 4, avoidedExpenses: 0 });
  assert.deepEqual(ids, ['first_quest', 'first_streak', 'first_month']);
});

test('défis : classement par score partagé, jamais par montant', () => {
  const rows = leaderboard([
    { userId: 'a', pseudo: 'Ana', avatar: 'fox', sharedScore: 5, left: false },
    { userId: 'b', pseudo: 'Bob', avatar: 'owl', sharedScore: 7, left: false },
    { userId: 'c', pseudo: 'Cy', avatar: 'cat', sharedScore: 5, left: false },
    { userId: 'd', pseudo: 'Dee', avatar: 'cat', sharedScore: 99, left: true },
  ]);
  assert.deepEqual(rows.map((r) => [r.pseudo, r.rank]), [['Bob', 1], ['Ana', 2], ['Cy', 2]]);
  for (const r of rows) assert.deepEqual(Object.keys(r).sort(), ['avatar', 'pseudo', 'rank', 'score', 'userId']);
  assert.equal(sanitizeSharedScore('goal_progress', 250), 100);
  assert.equal(sanitizeSharedScore('quests_count', -3), 0);
  assert.equal(collectiveProgress({ id: 'c', type: 'collective_habits', title: '', startDate: '', endDate: '', collectiveTarget: 20, visibility: 'private' }, [{ userId: 'a', pseudo: 'a', avatar: '', sharedScore: 5, left: false }]), 0.25);
  assert.equal(validatePseudo('ab'), 'Pseudo de 3 à 20 caractères.');
  assert.equal(validatePseudo('Kélyan_76'), null);
});
