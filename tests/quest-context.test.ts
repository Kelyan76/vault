import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateQuest, questById, startQuest } from '../supabase/functions/_shared/domain/quests.ts';
import { buildQuestContext, type QuestRows } from '../supabase/functions/_shared/server/quest-context.ts';

const empty: QuestRows = {
  today: '2026-10-17',
  currency: 'EUR',
  connections: [],
  accounts: [],
  bankTransactions: [],
  overrides: [],
  manualTransactions: [],
  savingsEntries: [],
  allocations: [],
  goals: [],
  budgets: [],
  habitCompletions: [],
  weeklyReviews: [],
};

const bt = (id: string, date: string, amount: number, label: string) => ({
  id, account_id: 'a1', booking_date: date, label, amount_minor: String(amount), currency: 'EUR', provider_category: null, status: 'booked' as const, removed: false, source: 'bank' as const, created_at: date,
});

test('contexte serveur : qualité des données déduite des connexions', () => {
  const none = buildQuestContext(empty);
  assert.equal(none.data.mode, 'none');
  assert.equal(none.data.healthy, false);

  const ctx = buildQuestContext({
    ...empty,
    connections: [
      { status: 'connected', provider: 'bridge', last_successful_sync_at: '2026-10-17T06:00:00Z', first_transaction_date: '2026-07-01', disconnected_at: null },
      { status: 'consent_expired', provider: 'bridge', last_successful_sync_at: '2026-09-01T00:00:00Z', first_transaction_date: '2026-06-01', disconnected_at: '2026-09-02T00:00:00Z' },
    ],
    accounts: [{ id: 'a1', type: 'checking' }],
    bankTransactions: [bt('t1', '2026-10-04', -10000, 'UBER EATS'), bt('t2', '2026-10-12', -2000, 'DELIVEROO')],
  });
  // La connexion déconnectée est ignorée.
  assert.deepEqual([ctx.data.mode, ctx.data.healthy, ctx.data.coverageFrom], ['bank', true, '2026-07-01']);
  const def = questById('q-delivery-down')!;
  const ev = evaluateQuest(def, startQuest(def, 'x', '2026-10-10'), ctx);
  assert.equal(ev.state, 'ready');
});

test('contexte serveur : une banque en erreur bloque la validation automatique', () => {
  const ctx = buildQuestContext({
    ...empty,
    connections: [
      { status: 'connected', provider: 'bridge', last_successful_sync_at: '2026-10-17T06:00:00Z', first_transaction_date: '2026-07-01', disconnected_at: null },
      { status: 'action_required', provider: 'bridge', last_successful_sync_at: '2026-10-17T06:00:00Z', first_transaction_date: '2026-07-01', disconnected_at: null },
    ],
  });
  assert.equal(ctx.data.healthy, false);
});

test('contexte serveur : saisies manuelles avec leur catégorie, habitudes par modèle, correction prioritaire', () => {
  const ctx = buildQuestContext({
    ...empty,
    accounts: [{ id: 'a1', type: 'checking' }],
    bankTransactions: [bt('t1', '2026-10-12', -2000, 'LIDL')],
    overrides: [{ bank_transaction_id: 't1', category: 'leisure', kind: null, updated_at: '2026-10-13T00:00:00Z' }],
    manualTransactions: [{ id: 'm1', booking_date: '2026-10-12', label: 'Marché', amount_minor: -1500, currency: 'EUR', category: 'groceries', kind: 'expense', created_at: '2026-10-12' }],
    habitCompletions: [{ habit_id: 'uuid-1', habit_template: 'check-budget', completed_on: '2026-10-12' }],
  });
  assert.equal(ctx.data.mode, 'manual');
  assert.equal(ctx.transactions.find((t) => t.id === 'manual:m1')?.classified.category, 'groceries');
  assert.equal(ctx.transactions.find((t) => t.id === 't1')?.classified.category, 'leisure');
  assert.equal(ctx.habitCompletions[0].habitId, 'habit-check-budget');
});
