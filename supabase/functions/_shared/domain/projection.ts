import type { ClassifiedTransaction } from './aggregation.ts';
import { normalizeLabel } from './categorize.ts';
import { addDays, diffDays, endOfMonth, startOfMonth, type DateStr } from './dates.ts';

// Solde prévu à la fin du mois, à partir du solde actuel et de la date du jour.
// Méthode transparente, détaillée ligne par ligne pour l'utilisateur :
//   solde actuel
//   (+ revenus réguliers pas encore reçus, seulement si includeIncome : désactivé par défaut,
//    pour montrer ce qui reste AVANT la prochaine paie, sans compter les virements reçus)
//   − prélèvements réguliers pas encore passés ce mois-ci
//   − reste de la prévision courses / carburant (prévision du mois − déjà dépensé)
//   − autres dépenses courantes : moyenne par jour × jours restants
// Ce n'est qu'une estimation : elle repose sur les mois précédents complets.

export type ProjectionLineKind = 'income' | 'recurring' | 'forecast' | 'variable';

export interface ProjectionLine {
  kind: ProjectionLineKind;
  label: string;
  /** Signé : positif = argent qui arrive, négatif = argent qui part. */
  amountMinor: number;
  /** Jour du mois habituel, pour les opérations régulières. */
  day?: number;
}

export interface ProjectionInput {
  today: DateStr;
  balanceMinor: number;
  currency: string;
  transactions: ClassifiedTransaction[];
  /** Première date couverte par les données (null : rien d'importé). */
  coverageFrom: DateStr | null;
  /** Prévision mensuelle de l'outil Prévisions, si l'utilisateur l'a enregistrée. */
  forecast?: { groceriesMonthlyMinor: number; fuelMonthlyMinor: number } | null;
  /** Compter les revenus réguliers attendus (salaire…). Par défaut non : aucune rentrée d'argent n'est anticipée. */
  includeIncome?: boolean;
}

export interface Projection {
  balanceMinor: number;
  projectedMinor: number;
  endOfMonth: DateStr;
  /** Jours restants après aujourd'hui, jusqu'au dernier jour du mois inclus. */
  daysLeft: number;
  /** Mois complets ayant servi de référence (0 : prévision peu fiable). */
  referenceMonths: number;
  lines: ProjectionLine[];
}

/** Clé d'opération régulière : libellé sans chiffres ni ponctuation (les dates et références changent chaque mois). */
export function recurringKey(label: string): string {
  return normalizeLabel(label)
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const dayOf = (d: DateStr) => Number(d.slice(8, 10));

interface Bucket {
  key: string;
  label: string;
  sign: 1 | -1;
  months: Map<string, { total: number; day: number }>;
  /** Nature « fixe » (loyer, abonnement, prélèvement, revenu) : reconnue dès un seul mois de recul. */
  fixed: boolean;
}

const FIXED_CATEGORIES = new Set(['housing', 'subscriptions']);

export function projectEndOfMonth(input: ProjectionInput): Projection {
  const { today, currency } = input;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const daysLeft = diffDays(monthEnd, today);
  const todayDay = dayOf(today);

  // Mois de référence : les 3 derniers mois complets entièrement couverts.
  const refMonths: { from: DateStr; to: DateStr }[] = [];
  let end = addDays(monthStart, -1);
  for (let k = 0; k < 3; k++) {
    const from = startOfMonth(end);
    if (!input.coverageFrom || input.coverageFrom > from) break;
    refMonths.push({ from, to: end });
    end = addDays(from, -1);
  }

  const forecastCats = new Set(input.forecast ? ['groceries', 'transport'] : []);
  const usable = input.transactions.filter((t) => t.currency === currency && t.status === 'booked' && !t.removed);
  // On suit l'argent qui sort ou entre vraiment : les transferts internes ne comptent pas,
  // les versements vers l'épargne oui (ils quittent le compte courant).
  const flows = usable.filter((t) => t.classified.kind !== 'internal_transfer' && !(t.classified.kind === 'savings_transfer' && t.amountMinor > 0));

  // 1. Opérations régulières (même libellé au moins 2 des mois de référence).
  const buckets = new Map<string, Bucket>();
  for (const t of flows) {
    const ref = refMonths.find((m) => t.date >= m.from && t.date <= m.to);
    if (!ref) continue;
    if (t.classified.kind === 'refund') continue;
    if (t.amountMinor < 0 && forecastCats.has(t.classified.category)) continue;
    if (t.amountMinor > 0 && (t.classified.kind !== 'income' || !input.includeIncome)) continue;
    const sign: 1 | -1 = t.amountMinor > 0 ? 1 : -1;
    const key = `${sign}:${recurringKey(t.label)}`;
    if (key.length < 4) continue;
    const b = buckets.get(key) ?? { key, label: t.label, sign, months: new Map(), fixed: false };
    b.fixed ||= t.classified.kind === 'income' || FIXED_CATEGORIES.has(t.classified.category) || t.operationType === 'direct_debit';
    const cur = b.months.get(ref.from) ?? { total: 0, day: dayOf(t.date) };
    cur.total += Math.abs(t.amountMinor);
    cur.day = Math.min(cur.day, dayOf(t.date));
    b.months.set(ref.from, cur);
    buckets.set(key, b);
  }
  // Régulière : vue au moins 2 mois ; avec un seul mois de recul, seulement les opérations de nature fixe.
  const recurring = [...buckets.values()].filter((b) => (refMonths.length >= 2 ? b.months.size >= 2 : refMonths.length === 1 && b.fixed));
  const recurringKeys = new Set(recurring.map((b) => b.key));

  const lines: ProjectionLine[] = [];
  for (const b of recurring) {
    const alreadyThisMonth = flows.some(
      (t) => t.date >= monthStart && t.date <= today && Math.sign(t.amountMinor) === b.sign && `${b.sign}:${recurringKey(t.label)}` === b.key,
    );
    if (alreadyThisMonth) continue;
    const day = median([...b.months.values()].map((m) => m.day));
    // Passé de plus de 3 jours sans apparaître : probablement arrêté ce mois-ci, on ne le compte pas.
    if (day < todayDay - 3) continue;
    const amount = median([...b.months.values()].map((m) => m.total));
    lines.push({ kind: b.sign > 0 ? 'income' : 'recurring', label: b.label, amountMinor: b.sign * amount, day });
  }
  lines.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

  // 2. Reste de la prévision courses / carburant.
  if (input.forecast) {
    const spentThisMonth = (cat: string) =>
      usable
        .filter((t) => t.date >= monthStart && t.date <= today && t.classified.category === cat)
        .reduce((s, t) => s + (t.classified.kind === 'expense' ? -t.amountMinor : t.classified.kind === 'refund' ? -t.amountMinor : 0), 0);
    const g = Math.max(0, input.forecast.groceriesMonthlyMinor - spentThisMonth('groceries'));
    const f = Math.max(0, input.forecast.fuelMonthlyMinor - spentThisMonth('transport'));
    if (g > 0) lines.push({ kind: 'forecast', label: 'Courses restantes (prévision)', amountMinor: -g });
    if (f > 0) lines.push({ kind: 'forecast', label: 'Carburant restant (prévision)', amountMinor: -f });
  }

  // 3. Autres dépenses courantes : moyenne quotidienne hors régulières et hors catégories prévues.
  if (refMonths.length && daysLeft > 0) {
    let total = 0;
    for (const t of flows) {
      if (t.amountMinor >= 0 || t.classified.kind !== 'expense') continue;
      if (forecastCats.has(t.classified.category)) continue;
      if (recurringKeys.has(`-1:${recurringKey(t.label)}`)) continue;
      if (!refMonths.some((m) => t.date >= m.from && t.date <= m.to)) continue;
      total += -t.amountMinor;
    }
    const refDays = refMonths.reduce((s, m) => s + diffDays(m.to, m.from) + 1, 0);
    const variable = Math.round((total / refDays) * daysLeft);
    if (variable > 0) lines.push({ kind: 'variable', label: `Autres dépenses courantes (${daysLeft} j)`, amountMinor: -variable });
  }

  const projected = input.balanceMinor + lines.reduce((s, l) => s + l.amountMinor, 0);
  return { balanceMinor: input.balanceMinor, projectedMinor: projected, endOfMonth: monthEnd, daysLeft, referenceMonths: refMonths.length, lines };
}
