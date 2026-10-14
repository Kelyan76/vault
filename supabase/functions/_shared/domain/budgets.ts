import { spentInCategory, type SpendingSummary } from './aggregation.ts';
import type { CategoryId } from './transactions.ts';

export interface Budget {
  id: string;
  category: CategoryId;
  /** Plafond pour la période choisie, en unités mineures. */
  limitMinor: number;
  currency: string;
  period: 'week' | 'month';
}

export type BudgetHealth = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budget: Budget;
  spentMinor: number;
  remainingMinor: number;
  /** Ratio consommé, peut dépasser 1. */
  ratio: number;
  health: BudgetHealth;
}

export function budgetStatus(budget: Budget, summary: SpendingSummary): BudgetStatus {
  if (summary.currency !== budget.currency) {
    throw new Error('Le budget et le résumé doivent être dans la même devise');
  }
  const spent = spentInCategory(summary, budget.category);
  const ratio = budget.limitMinor > 0 ? spent / budget.limitMinor : 0;
  return {
    budget,
    spentMinor: spent,
    remainingMinor: budget.limitMinor - spent,
    ratio,
    health: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok',
  };
}

export function validateBudget(input: Partial<Budget>): string | null {
  if (!input.category) return 'Choisis une catégorie.';
  if (input.category === 'income' || input.category === 'savings_transfers') return 'Un budget porte sur une catégorie de dépense.';
  if (!input.limitMinor || input.limitMinor <= 0) return 'Le plafond doit être positif.';
  if (input.limitMinor > 100_000_000) return 'Plafond trop élevé.';
  return null;
}
