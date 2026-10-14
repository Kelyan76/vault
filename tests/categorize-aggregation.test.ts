import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAll, compare, dailySpending, searchTransactions, summarizeSpending } from '../supabase/functions/_shared/domain/aggregation.ts';
import { budgetStatus, validateBudget } from '../supabase/functions/_shared/domain/budgets.ts';
import { classify, detectInternalTransfers } from '../supabase/functions/_shared/domain/categorize.ts';
import type { BankAccountRef } from '../supabase/functions/_shared/domain/transactions.ts';
import { tx } from './helpers.ts';

const accounts: BankAccountRef[] = [
  { id: 'cc', type: 'checking' },
  { id: 'cc2', type: 'checking' },
  { id: 'livret', type: 'savings' },
];
const period = { from: '2026-10-01', to: '2026-10-31' };

test('catégorisation par règle, transparente', () => {
  const c = classify(tx({ date: '2026-10-02', amountMinor: -2300, label: 'UBER EATS PARIS' }));
  assert.deepEqual([c.category, c.kind, c.source, c.ruleId], ['restaurants', 'expense', 'rule', 'delivery']);
  const d = classify(tx({ date: '2026-10-02', amountMinor: -500, label: 'XYZ inconnu' }));
  assert.deepEqual([d.category, d.kind, d.source], ['other', 'expense', 'default']);
});

test('la catégorie du prestataire est prioritaire sur les règles', () => {
  const c = classify(tx({ date: '2026-10-02', amountMinor: -2300, label: 'UBER EATS', providerCategory: '42' }), { providerMap: { '42': 'leisure' } });
  assert.equal(c.category, 'leisure');
  assert.equal(c.source, 'provider');
});

test('un remboursement n’est pas un revenu', () => {
  const c = classify(tx({ date: '2026-10-05', amountMinor: 1250, label: 'REMBOURSEMENT VINTED' }));
  assert.equal(c.kind, 'refund');
  assert.equal(c.category, 'shopping');
  const all = classifyAll([
    tx({ date: '2026-10-02', amountMinor: -3000, label: 'VINTED' }),
    tx({ date: '2026-10-05', amountMinor: 1250, label: 'REMBOURSEMENT VINTED' }),
  ]);
  const s = summarizeSpending(all, period, 'EUR');
  assert.equal(s.totalIncomeMinor, 0);
  assert.equal(s.byCategory.find((c) => c.category === 'shopping')?.spentMinor, 1750);
});

test('un transfert entre deux comptes de l’utilisateur n’est ni dépense ni revenu', () => {
  const txs = [
    tx({ id: 'a', accountId: 'cc', date: '2026-10-10', amountMinor: -20000, label: 'VIR INTERNE' }),
    tx({ id: 'b', accountId: 'cc2', date: '2026-10-11', amountMinor: 20000, label: 'VIR INTERNE' }),
  ];
  const links = detectInternalTransfers(txs, accounts);
  assert.equal(links.get('a')?.kind, 'internal_transfer');
  const s = summarizeSpending(classifyAll(txs, { accounts }), period, 'EUR');
  assert.equal(s.totalSpentMinor, 0);
  assert.equal(s.totalIncomeMinor, 0);
  assert.equal(s.savingsTransferMinor, 0);
});

test('un virement vers le livret est de l’épargne, compté une seule fois', () => {
  const txs = [
    tx({ id: 'a', accountId: 'cc', date: '2026-10-10', amountMinor: -10000, label: 'VIR VERS LIVRET' }),
    tx({ id: 'b', accountId: 'livret', date: '2026-10-10', amountMinor: 10000, label: 'VIR RECU' }),
    tx({ id: 'c', accountId: 'cc', date: '2026-10-12', amountMinor: -10000, label: 'VIR A UN AMI' }),
  ];
  const s = summarizeSpending(classifyAll(txs, { accounts }), period, 'EUR');
  assert.equal(s.savingsTransferMinor, 10000);
  assert.equal(s.totalIncomeMinor, 0);
  // Le virement sortant vers un tiers reste une dépense : tout virement n'est pas une économie.
  assert.equal(s.totalSpentMinor, 10000);
});

test('un virement sortant sans contrepartie chez l’utilisateur n’est pas un transfert interne', () => {
  const links = detectInternalTransfers([tx({ id: 'x', accountId: 'cc', date: '2026-10-10', amountMinor: -5000, label: 'VIR' })], accounts);
  assert.equal(links.size, 0);
});

test('les opérations en attente sont séparées et les opérations retirées exclues', () => {
  const all = classifyAll([
    tx({ date: '2026-10-02', amountMinor: -1000, label: 'LIDL' }),
    tx({ date: '2026-10-03', amountMinor: -2000, label: 'LIDL', status: 'pending' }),
    tx({ date: '2026-10-03', amountMinor: -9999, label: 'LIDL', removed: true }),
  ]);
  const s = summarizeSpending(all, period, 'EUR');
  assert.equal(s.totalSpentMinor, 1000);
  assert.equal(s.pendingMinor, 2000);
});

test('les devises ne sont pas mélangées', () => {
  const all = classifyAll([
    tx({ date: '2026-10-02', amountMinor: -1000, label: 'LIDL' }),
    tx({ date: '2026-10-02', amountMinor: -650, label: 'COFFEE', currency: 'USD' }),
  ]);
  const s = summarizeSpending(all, period, 'EUR');
  assert.equal(s.totalSpentMinor, 1000);
  assert.deepEqual(s.otherCurrencies, ['USD']);
});

test('la correction de catégorie de l’utilisateur l’emporte sans toucher l’opération', () => {
  const t = tx({ id: 'o', date: '2026-10-02', amountMinor: -1500, label: 'LIDL' });
  const before = JSON.stringify(t);
  const all = classifyAll([t], { overrides: [{ transactionId: 'o', category: 'leisure', updatedAt: '2026-10-03T00:00:00Z' }] });
  assert.equal(all[0].classified.category, 'leisure');
  assert.equal(all[0].classified.source, 'user');
  assert.equal(JSON.stringify(t), before);
  assert.equal(all[0].amountMinor, -1500);
  assert.equal(all[0].date, '2026-10-02');
});

test('budget : consommé, restant et alertes', () => {
  const all = classifyAll([tx({ date: '2026-10-02', amountMinor: -8500, label: 'PATHE CINEMA' })]);
  const s = summarizeSpending(all, period, 'EUR');
  const b = budgetStatus({ id: 'b', category: 'leisure', limitMinor: 10000, currency: 'EUR', period: 'month' }, s);
  assert.equal(b.spentMinor, 8500);
  assert.equal(b.remainingMinor, 1500);
  assert.equal(b.health, 'warning');
  assert.equal(validateBudget({ category: 'income', limitMinor: 100 }), 'Un budget porte sur une catégorie de dépense.');
});

test('comparaison de périodes sans division par zéro', () => {
  assert.deepEqual(compare(150, 100), { currentMinor: 150, previousMinor: 100, changePct: 50 });
  assert.equal(compare(100, 0).changePct, null);
});

test('série quotidienne et recherche', () => {
  const all = classifyAll([tx({ date: '2026-10-02', amountMinor: -1000, label: 'Lidl Rouen' })]);
  const series = dailySpending(all, { from: '2026-10-01', to: '2026-10-03' }, 'EUR');
  assert.deepEqual(series.map((d) => d.spentMinor), [0, 1000, 0]);
  assert.equal(searchTransactions(all, 'rouen').length, 1);
  assert.equal(searchTransactions(all, 'paris').length, 0);
});
