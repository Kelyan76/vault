import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as A from '../src/store/actions.ts';
import { allTransactions, dataQuality, evaluateAll, goalsProgress, progress, questContext } from '../src/store/derive.ts';
import { demoUserData, emptyUserData } from '../src/store/seed.ts';
import { addDays } from '../supabase/functions/_shared/domain/dates.ts';
import { summarizeSpending } from '../supabase/functions/_shared/domain/aggregation.ts';

let n = 0;
const env = (today = '2026-10-14', space: 'demo' | 'personal' = 'personal'): A.Env => ({ now: `${today}T09:00:00.000Z`, today, id: () => `id${++n}`, space });

test('démo : banque fictive synchronisée, données marquées démo, pas de doublon à la resynchronisation', () => {
  const d = demoUserData(env('2026-10-14', 'demo'));
  assert.equal(d.bank.connections[0].institutionName, 'Banque Démo (fictive)');
  const before = d.bank.transactions.length;
  const again = A.syncDemoBank(d, env('2026-10-14', 'demo')).data;
  assert.equal(again.bank.transactions.length, before);
  // Le lendemain : nouvelles opérations, l'opération en attente de la veille disparaît (retirée, pas dupliquée).
  const next = A.syncDemoBank(again, env('2026-10-15', 'demo')).data;
  const pending = next.bank.transactions.filter((t) => t.status === 'pending');
  assert.equal(pending.filter((t) => !t.removed).length, 1);
  assert.equal(pending.filter((t) => t.removed).length, 1);
  const ids = next.bank.transactions.map((t) => t.providerTransactionId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(allTransactions(next).every((t) => t.source !== 'bank'));
});

test('la banque fictive est refusée hors mode démo', () => {
  const r = A.connectDemoBank(emptyUserData('x', '2026-10-14'), env());
  assert.match(r.error!, /démonstration/);
});

test('démo : la qualité des données est « démo », jamais « banque »', () => {
  const d = demoUserData(env('2026-10-14', 'demo'));
  const q = dataQuality(d, allTransactions(d), 'demo');
  assert.equal(q.mode, 'demo');
  assert.equal(q.healthy, true);
});

test('saisie manuelle + correction de catégorie conservée', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-14');
  d = A.addManualTransaction(d, { label: 'Courses', amountMinor: 3250, direction: 'debit', date: '2026-10-13', category: 'groceries' }, env()).data;
  const tx = allTransactions(d)[0];
  assert.equal(tx.classified.category, 'groceries');
  assert.equal(tx.amountMinor, -3250);
  d = A.setCategory(d, tx.id, 'leisure', env()).data;
  const after = allTransactions(d)[0];
  assert.equal(after.classified.category, 'leisure');
  assert.equal(after.amountMinor, -3250);
  assert.equal(after.date, '2026-10-13');
  assert.equal(A.addManualTransaction(d, { label: 'x', amountMinor: 100, direction: 'debit', date: '2099-01-01', category: 'other' }, env()).error, 'La date ne peut pas être dans le futur.');
  const s = summarizeSpending(allTransactions(d), { from: '2026-10-01', to: '2026-10-31' }, 'EUR');
  assert.equal(s.totalSpentMinor, 3250);
  assert.equal(dataQuality(d, allTransactions(d), 'personal').mode, 'manual');
});

test('quête de bout en bout : démarrage, progression déclarée, validation, XP une seule fois', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-14');
  d = A.beginQuest(d, 'q-home-meals', env()).data;
  assert.equal(A.beginQuest(d, 'q-home-meals', env()).error, 'Cette quête est déjà en cours.');
  const uq = d.userQuests[0];
  for (let i = 0; i < 3; i++) d = A.bumpQuestCount(d, uq.id, 1, env()).data;
  const ctx = questContext(d, allTransactions(d), 'personal', '2026-10-14');
  const ev = evaluateAll(d, ctx).get(uq.id)!;
  assert.equal(ev.state, 'ready');
  const r = A.completeQuest(d, uq.id, ev, false, env());
  assert.deepEqual(r.effects.xp.map((x) => x.amount), [20, 25]);
  assert.ok(r.effects.badges.includes('first_quest'));
  const twice = A.completeQuest(r.data, uq.id, ev, false, env());
  assert.match(twice.error!, /plus active/);
  assert.equal(progress(r.data).xp, 45);
});

test('quête bancaire sans banque : pas de réussite automatique, déclaration explicite possible', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-01');
  d = A.beginQuest(d, 'q-delivery-down', env('2026-10-01')).data;
  const uq = d.userQuests[0];
  const ctx = questContext(d, allTransactions(d), 'personal', '2026-10-09');
  const ev = evaluateAll(d, ctx).get(uq.id)!;
  assert.equal(ev.state, 'insufficient_data');
  assert.match(A.completeQuest(d, uq.id, ev, false, env('2026-10-09')).error!, /pas encore réussie/);
  const declared = A.completeQuest(d, uq.id, ev, true, env('2026-10-09'));
  assert.equal(declared.data.userQuests[0].evidence, 'declared');
});

test('bilan hebdomadaire : une fois par semaine', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-14');
  const r1 = A.completeWeeklyReview(d, 'ok', env('2026-10-14'));
  d = r1.data;
  assert.equal(r1.effects.xp[0].amount, 20);
  assert.ok(A.completeWeeklyReview(d, 'ok', env('2026-10-16')).error);
  assert.equal(A.completeWeeklyReview(d, 'ok', env('2026-10-19')).effects.xp[0].amount, 20);
});

test('coffre : objectif atteint récompensé une fois, et pas pour un objectif tout juste créé', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-01');
  d = A.createGoal(d, { name: 'Casque', targetMinor: 5000, icon: 'gift' }, env('2026-10-01')).data;
  const g = d.goals[0];
  const fresh = A.addSavingsEntry(d, { amountMinor: 5000, allocations: [{ goalId: g.id, amountMinor: 5000 }], date: '2026-10-01' }, env('2026-10-01'));
  assert.equal(fresh.effects.xp.length, 0);
  // Le lendemain, une nouvelle écriture déclenche la récompense (objectif atteint et assez ancien).
  const later = A.addSavingsEntry(fresh.data, { amountMinor: 100, allocations: [], date: '2026-10-02' }, env('2026-10-02'));
  assert.deepEqual(later.effects.xp.map((x) => x.amount), [50]);
  const again = A.addSavingsEntry(later.data, { amountMinor: 100, allocations: [{ goalId: g.id, amountMinor: 100 }], date: '2026-10-03' }, env('2026-10-03'));
  assert.equal(again.effects.xp.length, 0);
  assert.equal(goalsProgress(again.data)[0].reached, true);
});

test('coffre : correction et suppression historisées', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-14');
  d = A.createGoal(d, { name: 'Voyage', targetMinor: 50000, icon: 'plane' }, env()).data;
  d = A.addSavingsEntry(d, { amountMinor: 2000, allocations: [{ goalId: d.goals[0].id, amountMinor: 2000 }], date: '2026-10-14' }, env()).data;
  const id = d.entries[0].id;
  d = A.correctSavingsEntry(d, id, 1500, env()).data;
  assert.equal(goalsProgress(d)[0].savedMinor, 1500);
  d = A.correctSavingsEntry(d, id, null, env()).data;
  assert.equal(goalsProgress(d)[0].savedMinor, 0);
  assert.deepEqual(d.entryHistory.map((h) => h.action), ['created', 'updated', 'deleted']);
});

test('dépense évitée : estimation séparée, mise de côté explicite et plafonnée', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-14');
  d = A.addAvoidedExpense(d, { label: 'Pizza livrée', plannedMinor: 2500, actualMinor: 700, date: '2026-10-14' }, env()).data;
  assert.equal(d.entries.length, 0); // rien n'entre seul dans le coffre
  const a = d.avoided[0];
  assert.match(A.setAsideFromAvoided(d, a.id, 2000, null, env()).error!, /dépasse/);
  d = A.setAsideFromAvoided(d, a.id, 1000, null, env()).data;
  assert.equal(d.entries[0].amountMinor, 1000);
  assert.equal(d.avoided[0].setAsideEntryId, d.entries[0].id);
  assert.match(A.setAsideFromAvoided(d, a.id, 500, null, env()).error!, /Déjà/);
});

test('virement observé vers l’épargne : confirmé une seule fois', () => {
  const d = demoUserData(env('2026-10-14', 'demo'));
  const out = d.bank.transactions.find((t) => t.label === 'VIR VERS LIVRET DEMO')!;
  const r = A.confirmSavingsTransfer(d, out.id, 'demo-g2', env('2026-10-14', 'demo'));
  assert.equal(r.error, undefined);
  assert.equal(r.data.entries.at(-1)!.kind, 'observed_transfer');
  assert.match(A.confirmSavingsTransfer(r.data, out.id, null, env('2026-10-14', 'demo')).error!, /déjà/);
});

test('habitudes : bonus de série une fois par palier et par série', () => {
  let d = emptyUserData('2026-10-01T00:00:00Z', '2026-10-14');
  const h = d.habits[0].id;
  d = A.toggleHabit(d, h, '2026-10-12', env()).data;
  d = A.toggleHabit(d, h, '2026-10-13', env()).data;
  const r = A.toggleHabit(d, h, '2026-10-14', env());
  assert.deepEqual(r.effects.xp.map((x) => x.amount), [10]);
  // Décocher puis recocher ne redonne pas le bonus.
  const off = A.toggleHabit(r.data, h, '2026-10-14', env()).data;
  assert.equal(A.toggleHabit(off, h, '2026-10-14', env()).effects.xp.length, 0);
  assert.match(A.toggleHabit(d, h, addDays('2026-10-14', 1), env()).error!, /aujourd/);
});

test('déconnexion de la banque fictive : historique gardé ou supprimé, coffre intact', () => {
  const d0 = demoUserData(env('2026-10-14', 'demo'));
  const out = d0.bank.transactions.find((t) => t.label === 'VIR VERS LIVRET DEMO')!;
  const d = A.confirmSavingsTransfer(d0, out.id, null, env('2026-10-14', 'demo')).data;
  const keep = A.disconnectDemoBank(d, false, env('2026-10-14', 'demo')).data;
  assert.equal(keep.bank.connections[0].status, 'disconnected');
  assert.ok(keep.bank.transactions.length > 0);
  assert.equal(dataQuality(keep, allTransactions(keep), 'demo').mode, 'none');
  const wipe = A.disconnectDemoBank(d, true, env('2026-10-14', 'demo')).data;
  assert.equal(wipe.bank.transactions.length, 0);
  assert.equal(wipe.entries.at(-1)!.sourceTransactionId, null);
  assert.equal(wipe.entries.length, d.entries.length);
});

test('défis : score partagé = actions, jamais de montant ; partage désactivable', () => {
  let d = demoUserData(env('2026-10-14', 'demo'));
  d = A.createChallenge(d, { type: 'goal_progress', title: 'Objectifs', days: 14, friendIds: ['demo-f1'] }, env('2026-10-14', 'demo')).data;
  const c = d.challenges.at(-1)!;
  const me = c.participants.find((p) => p.userId === 'me')!;
  assert.ok(me.sharedScore >= 0 && me.sharedScore <= 100);
  assert.match(A.createChallenge(d, { type: 'quests_count', title: 'Solo', days: 7, friendIds: ['demo-f3'] }, env()).error!, /ami/);
  d = A.updateProfile(d, { shareInChallenges: false }, env()).data;
  d = A.refreshMyScores(d, env()).data;
  assert.equal(d.challenges.at(-1)!.participants.find((p) => p.userId === 'me')!.sharedScore, 0);
});
