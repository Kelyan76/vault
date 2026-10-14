import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, isoWeekKey, periodContaining, previousPeriod, startOfWeek } from '../supabase/functions/_shared/domain/dates.ts';
import { formatMoney, parseAmountInput, toMinor } from '../supabase/functions/_shared/domain/money.ts';

test('les montants sont convertis en centimes sans erreur de flottant', () => {
  assert.equal(toMinor(0.1 + 0.2, 'EUR'), 30);
  assert.equal(toMinor(-12.345, 'EUR'), -1234);
  assert.equal(toMinor(1500, 'JPY'), 1500);
  assert.equal(toMinor(1.234, 'KWD'), 1234);
});

test('la saisie utilisateur est validée', () => {
  assert.equal(parseAmountInput('12,50', 'EUR'), 1250);
  assert.equal(parseAmountInput('1 200', 'EUR'), 120000);
  assert.equal(parseAmountInput('12.505', 'EUR'), null);
  assert.equal(parseAmountInput('-5', 'EUR'), null);
  assert.equal(parseAmountInput('abc', 'EUR'), null);
  assert.equal(parseAmountInput('0', 'EUR'), null);
});

test('formatMoney affiche la devise', () => {
  assert.match(formatMoney(1250, 'EUR'), /12,50\s?€/);
  assert.match(formatMoney(650, 'USD'), /6,50\s?\$US|6,50\s?\$/);
});

test('semaines ISO et périodes', () => {
  assert.equal(isoWeekKey('2026-10-14'), '2026-W42');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
  assert.equal(isoWeekKey('2024-12-30'), '2025-W01');
  assert.equal(startOfWeek('2026-10-14'), '2026-10-12');
  assert.deepEqual(periodContaining('2026-02-10', 'month'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(previousPeriod({ from: '2026-03-01', to: '2026-03-31' }, 'month'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
