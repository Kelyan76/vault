import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAll } from '../supabase/functions/_shared/domain/aggregation.ts';
import { actualMonthlyAverage, CAR_MODELS, departmentPrefix, fuelForecast, fuelRemaining, groceryForecast, groceryRemainingMinor, TANK_BY_MODEL, validateFuel, validateGrocery, workDaysLeftInMonth } from '../supabase/functions/_shared/domain/forecast.ts';
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

test('reste du mois : jours de travail restants à partir de la date', () => {
  // Jeudi 15 octobre 2026 : restent 16 jours, dont 11 jours ouvrés (ven. 16, puis 19-23 et 26-30) et 5 de week-end.
  assert.equal(workDaysLeftInMonth('2026-10-15', 5), 11);
  assert.equal(workDaysLeftInMonth('2026-10-15', 3), 11 * 3 / 5);
  assert.equal(workDaysLeftInMonth('2026-10-15', 7), 16);
  assert.equal(workDaysLeftInMonth('2026-10-31', 5), 0);
  assert.equal(groceryRemainingMinor({ adults: 1, teens: 0, children: 0, babies: 0, level: 'equilibre', mealsOutPerWeek: 0 }, '2026-10-15'), Math.round(5000 * 16 / 7));
});

test('carburant restant : 30 km aller, jauge à moitié, réservoir de 40 L', () => {
  const base = { kmOneWay: 30, workDaysPerWeek: 5, extraKmPerWeek: 0, carModelId: null, energy: 'sp95' as const, per100: 6, priceMinor: 217, tankCapacity: 40 };
  const sansJauge = fuelRemaining(base, '2026-10-15');
  // 11 jours x 60 km = 660 km, 39,6 L à acheter.
  assert.deepEqual([sansJauge.kmLeft, sansJauge.unitsNeeded, sansJauge.unitsToBuy, sansJauge.costMinor], [660, 39.6, 39.6, Math.round(39.6 * 217)]);
  const moitie = fuelRemaining({ ...base, gauge: 0.5, gaugeDate: '2026-10-15' }, '2026-10-15');
  assert.deepEqual([moitie.unitsInTank, moitie.unitsToBuy, moitie.usedGauge], [20, 19.6, true]);
  // Jauge vieille de plus de 3 jours : ignorée, par prudence.
  assert.equal(fuelRemaining({ ...base, gauge: 0.5, gaugeDate: '2026-10-05' }, '2026-10-15').usedGauge, false);
  // Plein suffisant : rien à acheter.
  assert.equal(fuelRemaining({ ...base, gauge: 1, gaugeDate: '2026-10-14' }, '2026-10-15').costMinor, 0);
  assert.ok(CAR_MODELS.every((m) => TANK_BY_MODEL[m.id] > 0));
});

test('département à partir du code postal', () => {
  assert.equal(departmentPrefix('76600'), '76');
  assert.equal(departmentPrefix('20000'), '20');
  assert.equal(departmentPrefix('97400'), '974');
  assert.equal(departmentPrefix('7660'), null);
  assert.equal(departmentPrefix(''), null);
});

test('courses : ta part quand le foyer partage (moitié-moitié)', () => {
  const tout = groceryForecast({ adults: 2, teens: 0, children: 0, babies: 0, level: 'econome', mealsOutPerWeek: 0 });
  const moitie = groceryForecast({ adults: 2, teens: 0, children: 0, babies: 0, level: 'econome', mealsOutPerWeek: 0, myShare: 0.5 });
  assert.equal(moitie.weeklyMinor, tout.weeklyMinor / 2);
  assert.equal(validateGrocery({ adults: 2, teens: 0, children: 0, babies: 0, level: 'econome', mealsOutPerWeek: 0, myShare: 1.5 }), 'Ta part doit être comprise entre 1 et 100 %.');
});
