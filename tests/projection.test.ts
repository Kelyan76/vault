import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAll } from '../supabase/functions/_shared/domain/aggregation.ts';
import { projectEndOfMonth, recurringKey } from '../supabase/functions/_shared/domain/projection.ts';
import { tx } from './helpers.ts';

// Historique type sur juillet, août, septembre ; aujourd'hui le 15 octobre.
function history() {
  const rows = [];
  const restos: Record<string, string> = { '07': 'PIZZA NAPOLI', '08': 'SUSHI KYO', '09': 'BURGER BAR' };
  for (const m of ['07', '08', '09']) {
    rows.push(tx({ date: `2026-${m}-01`, amountMinor: 165000, label: `VIR SALAIRE ACME ${m}/2026` }));
    rows.push(tx({ date: `2026-${m}-03`, amountMinor: -52000, label: 'PRLV LOYER APPARTEMENT' }));
    rows.push(tx({ date: `2026-${m}-20`, amountMinor: -1399, label: `NETFLIX.COM ${m}` }));
    rows.push(tx({ date: `2026-${m}-10`, amountMinor: -9000, label: 'LIDL ROUEN' }));
    rows.push(tx({ date: `2026-${m}-12`, amountMinor: -3100, label: restos[m] })); // variable : libellé différent chaque mois
  }
  // Octobre jusqu'au 15 : salaire et loyer déjà passés, Netflix (le 20) pas encore.
  rows.push(tx({ date: '2026-10-01', amountMinor: 165000, label: 'VIR SALAIRE ACME 10/2026' }));
  rows.push(tx({ date: '2026-10-03', amountMinor: -52000, label: 'PRLV LOYER APPARTEMENT' }));
  rows.push(tx({ date: '2026-10-08', amountMinor: -6000, label: 'LIDL ROUEN' }));
  return classifyAll(rows);
}

test('clé d’opération régulière : chiffres et références ignorés', () => {
  assert.equal(recurringKey('VIR SALAIRE ACME 09/2026'), recurringKey('VIR SALAIRE ACME 10/2026'));
  assert.equal(recurringKey('NETFLIX.COM 07'), 'netflix com');
});

test('fin de mois : régulières à venir, déjà passées exclues, autres dépenses au prorata', () => {
  const p = projectEndOfMonth({ today: '2026-10-15', balanceMinor: 100000, currency: 'EUR', transactions: history(), coverageFrom: '2026-07-01' });
  assert.equal(p.endOfMonth, '2026-10-31');
  assert.equal(p.daysLeft, 16);
  assert.equal(p.referenceMonths, 3);
  const labels = p.lines.map((l) => l.label);
  // Netflix (le 20) est à venir ; salaire et loyer déjà passés ce mois-ci ; Lidl déjà passé.
  assert.ok(labels.some((l) => l.startsWith('NETFLIX')));
  assert.ok(!labels.some((l) => l.includes('SALAIRE') || l.includes('LOYER') || l.includes('LIDL')));
  const netflix = p.lines.find((l) => l.label.startsWith('NETFLIX'))!;
  assert.deepEqual([netflix.kind, netflix.amountMinor, netflix.day], ['recurring', -1399, 20]);
  // Autres dépenses : 3 x 31 € de restaurant sur 92 jours, x 16 jours restants.
  const variable = p.lines.find((l) => l.kind === 'variable')!;
  assert.equal(variable.amountMinor, -Math.round((9300 / 92) * 16));
  assert.equal(p.projectedMinor, 100000 - 1399 + variable.amountMinor);
});

test('le jour du mois compte : au 2 octobre, salaire et loyer sont encore à venir', () => {
  const rows = history().filter((t) => t.date < '2026-10-01');
  const p = projectEndOfMonth({ today: '2026-10-02', balanceMinor: 20000, currency: 'EUR', transactions: rows, coverageFrom: '2026-07-01' });
  // Le salaire (le 1er) a un jour de retard : il est encore attendu (tolérance de 3 jours).
  const income = p.lines.find((l) => l.kind === 'income');
  assert.equal(income?.amountMinor, 165000);
  assert.ok(p.lines.some((l) => l.label === 'PRLV LOYER APPARTEMENT' && l.amountMinor === -52000));
  assert.equal(p.daysLeft, 29);
});

test('avec la prévision : reste des courses = prévision du mois − déjà dépensé, pas de double comptage', () => {
  const p = projectEndOfMonth({
    today: '2026-10-15',
    balanceMinor: 100000,
    currency: 'EUR',
    transactions: history(),
    coverageFrom: '2026-07-01',
    forecast: { groceriesMonthlyMinor: 25000, fuelMonthlyMinor: 8000 },
  });
  const g = p.lines.find((l) => l.label.startsWith('Courses'))!;
  assert.equal(g.amountMinor, -(25000 - 6000));
  assert.equal(p.lines.find((l) => l.label.startsWith('Carburant'))!.amountMinor, -8000);
  // Lidl n'est plus traité comme une opération régulière : il est couvert par la prévision.
  assert.ok(!p.lines.some((l) => l.label.startsWith('LIDL')));
});

test('sans historique complet : seulement le solde et la prévision', () => {
  const p = projectEndOfMonth({ today: '2026-10-15', balanceMinor: 50000, currency: 'EUR', transactions: history(), coverageFrom: '2026-10-01' });
  assert.equal(p.referenceMonths, 0);
  assert.deepEqual(p.lines, []);
  assert.equal(p.projectedMinor, 50000);
});

test('un seul mois de recul : loyer, abonnements et salaire restent réguliers, pas étalés', () => {
  const rows = classifyAll([
    tx({ date: '2026-09-01', amountMinor: 165000, label: 'VIR SALAIRE ACME 09/2026' }),
    tx({ date: '2026-09-25', amountMinor: -52000, label: 'PRLV LOYER APPARTEMENT', operationType: 'direct_debit' }),
    tx({ date: '2026-09-12', amountMinor: -3000, label: 'PIZZA NAPOLI' }),
  ]);
  const p = projectEndOfMonth({ today: '2026-10-15', balanceMinor: 100000, currency: 'EUR', transactions: rows, coverageFrom: '2026-09-01' });
  assert.equal(p.referenceMonths, 1);
  const loyer = p.lines.find((l) => l.label === 'PRLV LOYER APPARTEMENT')!;
  assert.deepEqual([loyer.kind, loyer.amountMinor, loyer.day], ['recurring', -52000, 25]);
  // Le salaire du 1er n'est pas encore arrivé en octobre, mais son jour est passé de plus de 3 jours : non compté.
  assert.ok(!p.lines.some((l) => l.kind === 'income'));
  // Seule la pizza est étalée : 30 € sur 30 jours, x 16 jours.
  assert.equal(p.lines.find((l) => l.kind === 'variable')!.amountMinor, -1600);
});
