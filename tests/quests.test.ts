import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAll } from '../supabase/functions/_shared/domain/aggregation.ts';
import { addDays } from '../supabase/functions/_shared/domain/dates.ts';
import { evaluateQuest, questById, startQuest, type DataQuality, type QuestContext } from '../supabase/functions/_shared/domain/quests.ts';
import { tx } from './helpers.ts';

const healthyBank: DataQuality = { mode: 'bank', coverageFrom: '2026-09-01', lastSyncAt: '2026-10-20T08:00:00Z', healthy: true, uncategorizedShare: 0.05 };

function ctx(today: string, partial: Partial<QuestContext> = {}): QuestContext {
  return { today, transactions: [], currency: 'EUR', entries: [], goals: [], budgets: [], habitCompletions: [], weeklyReviews: [], data: healthyBank, ...partial };
}

const delivery = questById('q-delivery-down')!;
// Quête du 10 au 16 octobre, période de référence du 3 au 9.
const uq = startQuest(delivery, 'uq1', '2026-10-10');

function deliveries(before: number, during: number) {
  return classifyAll([
    tx({ date: '2026-10-04', amountMinor: -before, label: 'UBER EATS' }),
    tx({ date: '2026-10-12', amountMinor: -during, label: 'DELIVEROO' }),
  ]);
}

test('réduction des livraisons validée par des données bancaires fiables', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 5000) }));
  assert.equal(e.state, 'ready');
  assert.equal(e.evidence, 'bank_data');
});

test('réduction insuffisante : échec, pas de validation', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 9000) }));
  assert.equal(e.state, 'failed');
});

test('pas de résultat avant la fin de la période', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-12', { transactions: deliveries(10000, 0) }));
  assert.equal(e.state, 'in_progress');
});

test('connexion interrompue : jamais de réussite automatique', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 0), data: { ...healthyBank, healthy: false } }));
  assert.equal(e.state, 'insufficient_data');
  assert.equal(e.canDeclareManually, true);
});

test('données pas encore synchronisées jusqu’à la fin : pas de validation', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 0), data: { ...healthyBank, lastSyncAt: '2026-10-14T00:00:00Z' } }));
  assert.equal(e.state, 'insufficient_data');
});

test('historique trop court ou mal catégorisé : pas de validation', () => {
  const short = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 0), data: { ...healthyBank, coverageFrom: '2026-10-08' } }));
  assert.equal(short.state, 'insufficient_data');
  const messy = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 0), data: { ...healthyBank, uncategorizedShare: 0.6 } }));
  assert.equal(messy.state, 'insufficient_data');
});

test('aucune dépense de référence : rien à comparer', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: classifyAll([]) }));
  assert.equal(e.state, 'insufficient_data');
});

test('mode manuel : pas de vérification bancaire automatique', () => {
  const e = evaluateQuest(delivery, uq, ctx('2026-10-17', { transactions: deliveries(10000, 0), data: { ...healthyBank, mode: 'manual' } }));
  assert.equal(e.state, 'insufficient_data');
});

test('budget loisirs : dépassement = échec, respect + données fiables = réussite', () => {
  const def = questById('q-leisure-budget')!;
  const q = startQuest(def, 'uq2', '2026-10-10');
  const budgets = [{ id: 'b', category: 'leisure' as const, limitMinor: 7000, currency: 'EUR', period: 'week' as const }];
  const over = evaluateQuest(def, q, ctx('2026-10-17', { budgets, transactions: classifyAll([tx({ date: '2026-10-11', amountMinor: -9000, label: 'PATHE CINEMA' })]) }));
  assert.equal(over.state, 'failed');
  const ok = evaluateQuest(def, q, ctx('2026-10-17', { budgets, transactions: classifyAll([tx({ date: '2026-10-11', amountMinor: -3000, label: 'PATHE CINEMA' })]) }));
  assert.equal(ok.state, 'ready');
  const noBudget = evaluateQuest(def, q, ctx('2026-10-17'));
  assert.equal(noBudget.state, 'insufficient_data');
});

test('quêtes déclaratives : checklist et compteur', () => {
  const sub = questById('q-subscriptions')!;
  const q = startQuest(sub, 'uq3', '2026-10-10');
  assert.equal(evaluateQuest(sub, { ...q, checkedSteps: [0, 1] }, ctx('2026-10-11')).state, 'in_progress');
  const done = evaluateQuest(sub, { ...q, checkedSteps: [0, 1, 2, 2] }, ctx('2026-10-11'));
  assert.equal(done.state, 'ready');
  assert.equal(done.evidence, 'declared');
  const meals = questById('q-home-meals')!;
  assert.equal(evaluateQuest(meals, { ...startQuest(meals, 'm', '2026-10-10'), manualCount: 3 }, ctx('2026-10-11')).state, 'ready');
});

test('épargne pendant la quête et expiration', () => {
  const def = questById('q-save-10')!;
  const q = startQuest(def, 'uq4', '2026-10-10');
  const entries = [{ id: 'e', kind: 'declared' as const, amountMinor: 1000, currency: 'EUR', date: '2026-10-12', allocations: [], createdAt: '', updatedAt: '' }];
  assert.equal(evaluateQuest(def, q, ctx('2026-10-12', { entries })).state, 'ready');
  // Une mise de côté antérieure à la quête ne compte pas.
  const old = [{ ...entries[0], date: '2026-10-01' }];
  assert.equal(evaluateQuest(def, q, ctx('2026-10-12', { entries: old })).state, 'in_progress');
  assert.equal(evaluateQuest(def, q, ctx(addDays(q.endDate, 1), { entries: old })).state, 'expired');
});

test('analyse 7 jours : jours distincts', () => {
  const def = questById('q-analyse-7')!;
  const q = startQuest(def, 'uq5', '2026-10-10');
  const habitCompletions = Array.from({ length: 7 }, (_, i) => ({ habitId: 'habit-check-budget', date: addDays('2026-10-10', i) }));
  assert.equal(evaluateQuest(def, q, ctx('2026-10-16', { habitCompletions })).state, 'ready');
  const dup = [habitCompletions[0], habitCompletions[0]];
  assert.equal(evaluateQuest(def, q, ctx('2026-10-16', { habitCompletions: dup })).progress, 1 / 7);
});
