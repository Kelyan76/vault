import type { ClassifiedTransaction } from './aggregation.ts';
import type { DateStr } from './dates.ts';

// Le coffre est un outil de suivi : il ne détient aucun argent.
// On distingue soigneusement :
//  - declared : somme que l'utilisateur dit avoir mise de côté,
//  - observed_transfer : virement vers un compte d'épargne vu dans les données bancaires et confirmé par l'utilisateur,
//  - les économies estimées (dépenses évitées) qui ne vont jamais seules dans le coffre.

export interface SavingsGoal {
  id: string;
  name: string;
  targetMinor: number;
  currency: string;
  deadline?: DateStr | null;
  icon: GoalIcon;
  createdAt: string;
  archivedAt?: string | null;
}

export type GoalIcon = 'plane' | 'laptop' | 'shield' | 'home' | 'gift' | 'bike' | 'book' | 'star';

export type SavingsEntryKind = 'declared' | 'observed_transfer';

export interface Allocation {
  goalId: string;
  amountMinor: number;
}

export interface SavingsEntry {
  id: string;
  kind: SavingsEntryKind;
  /** Positif = mise de côté, négatif = retrait (correction ou dépense de l'épargne). */
  amountMinor: number;
  currency: string;
  date: DateStr;
  note?: string;
  allocations: Allocation[];
  /** Opération bancaire à l'origine d'un « observed_transfer » : unique, empêche le double comptage. */
  sourceTransactionId?: string | null;
  /** Dépense évitée d'où vient la mise de côté, si c'est le cas. */
  avoidedExpenseId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function validateGoal(input: Partial<SavingsGoal>): string | null {
  if (!input.name || input.name.trim().length < 2) return 'Donne un nom à ton objectif.';
  if (input.name.trim().length > 60) return 'Nom trop long (60 caractères max).';
  if (!input.targetMinor || input.targetMinor <= 0) return 'Le montant cible doit être positif.';
  if (input.targetMinor > 100_000_000) return 'Montant cible trop élevé.';
  return null;
}

export function validateEntry(entry: Pick<SavingsEntry, 'amountMinor' | 'allocations' | 'currency'>, goals: SavingsGoal[]): string | null {
  if (!Number.isInteger(entry.amountMinor) || entry.amountMinor === 0) return 'Montant invalide.';
  const sum = entry.allocations.reduce((s, a) => s + a.amountMinor, 0);
  for (const a of entry.allocations) {
    const goal = goals.find((g) => g.id === a.goalId);
    if (!goal) return 'Objectif introuvable.';
    if (goal.currency !== entry.currency) return 'La devise doit être celle de l’objectif.';
    if (Math.sign(a.amountMinor) !== Math.sign(entry.amountMinor)) return 'Répartition incohérente.';
  }
  if (Math.abs(sum) > Math.abs(entry.amountMinor)) return 'La répartition dépasse le montant.';
  return null;
}

/** Répartit un montant entre objectifs selon des poids, sans perdre de centime. */
export function splitEvenly(amountMinor: number, goalIds: string[]): Allocation[] {
  if (goalIds.length === 0) return [];
  const base = Math.trunc(amountMinor / goalIds.length);
  let rest = amountMinor - base * goalIds.length;
  return goalIds.map((goalId) => {
    const extra = rest !== 0 ? Math.sign(rest) : 0;
    rest -= extra;
    return { goalId, amountMinor: base + extra };
  });
}

export interface GoalProgress {
  goal: SavingsGoal;
  savedMinor: number;
  declaredMinor: number;
  observedMinor: number;
  ratio: number;
  reached: boolean;
}

export function goalProgress(goal: SavingsGoal, entries: SavingsEntry[]): GoalProgress {
  let declared = 0;
  let observed = 0;
  for (const e of entries) {
    for (const a of e.allocations) {
      if (a.goalId !== goal.id) continue;
      if (e.kind === 'declared') declared += a.amountMinor;
      else observed += a.amountMinor;
    }
  }
  const saved = Math.max(0, declared + observed);
  return {
    goal,
    savedMinor: saved,
    declaredMinor: declared,
    observedMinor: observed,
    ratio: goal.targetMinor > 0 ? Math.min(1, saved / goal.targetMinor) : 0,
    reached: saved >= goal.targetMinor,
  };
}

/** Total suivi dans le coffre, par devise ; une somme non répartie compte aussi. */
export function vaultTotals(entries: SavingsEntry[]): Record<string, { declaredMinor: number; observedMinor: number }> {
  const out: Record<string, { declaredMinor: number; observedMinor: number }> = {};
  for (const e of entries) {
    const slot = (out[e.currency] ??= { declaredMinor: 0, observedMinor: 0 });
    if (e.kind === 'declared') slot.declaredMinor += e.amountMinor;
    else slot.observedMinor += e.amountMinor;
  }
  return out;
}

/**
 * Propose les virements vers l'épargne détectés et pas encore confirmés.
 * Seule la jambe sortante est proposée, et jamais un virement sortant quelconque :
 * il faut que la catégorisation l'ait reconnu comme versement vers un compte d'épargne de l'utilisateur.
 */
export function savingsTransferSuggestions(txs: ClassifiedTransaction[], entries: SavingsEntry[]): ClassifiedTransaction[] {
  const linked = new Set(entries.map((e) => e.sourceTransactionId).filter(Boolean));
  return txs.filter(
    (t) => t.classified.kind === 'savings_transfer' && t.amountMinor < 0 && t.status === 'booked' && !linked.has(t.id),
  );
}

export type GoalStage = 0 | 1 | 2 | 3 | 4;

/** Stade visuel du coffre (0 = vide, 4 = débordant) selon la progression moyenne des objectifs. */
export function vaultStage(progress: GoalProgress[]): GoalStage {
  if (progress.length === 0) return 0;
  const avg = progress.reduce((s, p) => s + p.ratio, 0) / progress.length;
  if (avg >= 1) return 4;
  if (avg >= 0.6) return 3;
  if (avg >= 0.25) return 2;
  if (avg > 0) return 1;
  return 0;
}

// ——— Dépenses évitées ———

export interface AvoidedExpense {
  id: string;
  label: string;
  plannedMinor: number;
  actualMinor: number;
  currency: string;
  date: DateStr;
  /** Mise de côté réellement déclarée à partir de cette économie (action séparée). */
  setAsideEntryId?: string | null;
  createdAt: string;
}

/** Économie estimée : toujours présentée comme une estimation, jamais ajoutée seule au coffre. */
export function estimatedSaving(a: Pick<AvoidedExpense, 'plannedMinor' | 'actualMinor'>): number {
  return Math.max(0, a.plannedMinor - a.actualMinor);
}

export function validateAvoided(input: Partial<AvoidedExpense>): string | null {
  if (!input.label || input.label.trim().length < 2) return 'Décris la dépense évitée.';
  if (!input.plannedMinor || input.plannedMinor <= 0) return 'Indique le montant prévu.';
  if (input.actualMinor === undefined || input.actualMinor < 0) return 'Indique le montant réellement dépensé (0 si rien).';
  if (input.actualMinor > input.plannedMinor) return 'Le montant dépensé dépasse le montant prévu : rien n’a été évité.';
  return null;
}
