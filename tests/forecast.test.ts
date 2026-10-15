import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAll } from '../supabase/functions/_shared/domain/aggregation.ts';
import { actualMonthlyAverage, CAR_MODELS, fuelForecast, groceryForecast, validateFuel, validateGrocery } from '../supabase/functions/_shared/domain/forecast.ts';
import { tx } from './helpers.ts';

test('courses : foyer, niveau et repas pris dehors', () => {
  const couple = groceryForecast({ adults: 2, teens: 0, children: 1, babies: 0, level: 'equilibre', mealsOutPerWeek: 0 });
  assert.equal(couple.weeklyMinor, 13500);
  assert.equal(couple.monthlyMinor, Math.round(13500 * 52 / 12));
  const eco = groceryForecast({ adults: 2, teens: 0, children: 1, babies: 0, level: 'econome', mealsOutPerWeek: 0 });
  assert.ok(eco.weeklyMinor < couple.weeklyMinor);
  // 10 repas de cantine sur 63 repas du foyer : environ 16 % de courses en moins.
  const cantine = groceryForecast({ adults: 2, teens: 0, children: 1, babies: 0, level: 'equilibre', mealsOutPerWeek: 10 });
  assert.equal(cantine.weeklyMinor, Math.round(13500 * (1 - 10 / 63)));
  assert.equal(validateGrocery({ adults: 0, teens: 0, children: 0, babies: 0, level: 'econome', mealsOutPerWeek: 0 }), 'Le foyer compte au moins une personne.');
});

test('carburant : trajets domicile-travail et autres trajets', () => {
  const f = fuelForecast({ kmOneWay: 20, workDaysPerWeek: 5, extraKmPerWeek: 50, carModelId: null, energy: 'sp95', per100: 6, priceMinor: 180 });
  // (2 x 20 x 5 + 50) km/semaine = 250 km, x 52/12 = 1083 km/mois, 65 L, 117 € environ.
  assert.equal(f.kmPerMonth, 1083);
  assert.equal(f.unitsPerMonth, 65);
  assert.equal(f.monthlyMinor, Math.round((250 * 52 / 12) * 0.06 * 180));
  assert.equal(f.commuteMonthlyMinor, Math.round((200 * 52 / 12) * 0.06 * 180));
  assert.equal(validateFuel({ kmOneWay: 20, workDaysPerWeek: 8, extraKmPerWeek: 0, carModelId: null, energy: 'sp95', per100: 6, priceMinor: 180 }), 'Jours travaillés : entre 0 et 7.');
  assert.match(validateFuel({ kmOneWay: 20, workDaysPerWeek: 5, extraKmPerWeek: 0, carModelId: null, energy: 'gazole', per100: 25, priceMinor: 180 })!, /Consommation/);
  assert.equal(validateFuel({ kmOneWay: 20, workDaysPerWeek: 5, extraKmPerWeek: 0, carModelId: null, energy: 'electrique', per100: 25, priceMinor: 25 }), null);
  assert.equal(new Set(CAR_MODELS.map((m) => m.id)).size, CAR_MODELS.length);
});

test('moyenne réelle : mois complets couverts seulement, remboursements déduits', () => {
  const txs = classifyAll([
    tx({ date: '2026-07-10', amountMinor: -30000, label: 'LIDL' }), // mois non couvert
    tx({ date: '2026-08-05', amountMinor: -20000, label: 'LIDL' }),
    tx({ date: '2026-09-05', amountMinor: -40000, label: 'CARREFOUR' }),
    tx({ date: '2026-09-06', amountMinor: 5000, label: 'REMBOURSEMENT CARREFOUR' }),
    tx({ date: '2026-10-03', amountMinor: -99999, label: 'LIDL' }), // mois en cours exclu
  ]);
  const avg = actualMonthlyAverage(txs, 'groceries', 'EUR', '2026-10-15', '2026-07-17');
  // Juillet n'est pas couvert en entier : moyenne sur août et septembre = (200 + 350) / 2.
  assert.deepEqual(avg, { monthlyMinor: 27500, months: 2 });
  assert.deepEqual(actualMonthlyAverage(txs, 'groceries', 'EUR', '2026-10-15', null), { monthlyMinor: null, months: 0 });
});
