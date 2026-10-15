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
  const p = projectEndOfMonth({ today: '2026-10-02', balanceMinor: 20000, currency: 'EUR', transactions: rows, coverageFrom: '2026-07-01', includeIncome: true });
  // Le salaire (le 1er) a un jour de retard : il est encore attendu (tolérance de 3 jours).
  const income = p.lines.find((l) => l.kind === 'income');
  assert.equal(income?.amountMinor, 165000);
  assert.ok(p.lines.some((l) => l.label === 'PRLV LOYER APPARTEMENT' && l.amountMinor === -52000));
  assert.equal(p.daysLeft, 29);
});

test('avec la prévision : reste des courses et du carburant déjà calculé à la date, Lidl non compté deux fois', () => {
  const p = projectEndOfMonth({
    today: '2026-10-15',
    balanceMinor: 100000,
    currency: 'EUR',
    transactions: history(),
    coverageFrom: '2026-07-01',
    forecastRemaining: { groceriesMinor: 11400, fuelMinor: 4300 },
  });
  assert.equal(p.lines.find((l) => l.label.startsWith('Courses'))!.amountMinor, -11400);
  assert.equal(p.lines.find((l) => l.label.startsWith('Carburant'))!.amountMinor, -4300);
  assert.ok(!p.lines.some((l) => l.label.startsWith('LIDL')));
});

test('entrées et sorties fixes : loyer du 10 avec électricité variable, APL du 5', () => {
  // Loyer : libellé différent chaque mois (mois écrit en toutes lettres), montant 497 € + électricité.
  const months: [string, string, number][] = [['07', 'JUILLET', 52100], ['08', 'AOUT', 50800], ['09', 'SEPTEMBRE', 53300]];
  const rows = [];
  for (const [m, name, amount] of months) {
    rows.push(tx({ date: `2026-${m}-10`, amountMinor: -amount, label: `VIR LOYER ${name} M DUPONT` }));
    rows.push(tx({ date: `2026-${m}-05`, amountMinor: 34400, label: `CAF APL ${m}` }));
    rows.push(tx({ date: `2026-${m}-12`, amountMinor: -3000, label: m === '07' ? 'PIZZA NAPOLI' : m === '08' ? 'SUSHI KYO' : 'BURGER BAR' }));
  }
  const fixedItems = [
    { id: 'loyer', label: 'Loyer', amountMinor: 49700, direction: 'out' as const, day: 10 },
    { id: 'apl', label: 'APL', amountMinor: 34400, direction: 'in' as const, day: 5 },
  ];
  const sansFixes = projectEndOfMonth({ today: '2026-10-02', balanceMinor: 100000, currency: 'EUR', transactions: classifyAll(rows), coverageFrom: '2026-07-01' });
  const p = projectEndOfMonth({ today: '2026-10-02', balanceMinor: 100000, currency: 'EUR', transactions: classifyAll(rows), coverageFrom: '2026-07-01', fixedItems });
  // Avec les entrées fixes, le loyer ne gonfle plus les dépenses courantes : seules les 3 sorties resto restent.
  const variable = p.lines.find((l) => l.kind === 'variable')!;
  assert.equal(variable.amountMinor, -Math.round((9000 / 92) * 29));
  assert.ok(sansFixes.lines.find((l) => l.kind === 'variable')!.amountMinor < variable.amountMinor);
  // Le 2 : APL (le 5) et loyer (le 10) sont à venir, montants déclarés.
  assert.deepEqual(p.lines.filter((l) => l.kind === 'fixed').map((l) => [l.label, l.amountMinor, l.day]), [['APL', 34400, 5], ['Loyer', -49700, 10]]);
  // Le 15 octobre, avec loyer et APL déjà passés ce mois-ci : plus rien à compter.
  const oct = classifyAll([...rows, tx({ date: '2026-10-05', amountMinor: 34400, label: 'CAF APL 10' }), tx({ date: '2026-10-10', amountMinor: -51200, label: 'VIR LOYER OCTOBRE M DUPONT' })]);
  const mid = projectEndOfMonth({ today: '2026-10-15', balanceMinor: 100000, currency: 'EUR', transactions: oct, coverageFrom: '2026-07-01', fixedItems });
  assert.ok(!mid.lines.some((l) => l.kind === 'fixed'));
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

test('par défaut, aucune rentrée d’argent n’est anticipée (ni salaire, ni virement reçu)', () => {
  const rows = history().filter((t) => t.date < '2026-10-01');
  const p = projectEndOfMonth({ today: '2026-10-02', balanceMinor: 20000, currency: 'EUR', transactions: rows, coverageFrom: '2026-07-01' });
  assert.ok(p.lines.every((l) => l.amountMinor < 0));
  assert.ok(!p.lines.some((l) => l.kind === 'income'));
  // Le loyer à venir reste bien déduit.
  assert.ok(p.lines.some((l) => l.label === 'PRLV LOYER APPARTEMENT'));
});
