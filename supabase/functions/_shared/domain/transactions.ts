import type { DateStr } from './dates.ts';

export const CATEGORY_IDS = [
  'groceries',
  'restaurants',
  'transport',
  'housing',
  'subscriptions',
  'shopping',
  'leisure',
  'health',
  'income',
  'savings_transfers',
  'other',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  groceries: 'Alimentation',
  restaurants: 'Restaurants et livraison',
  transport: 'Transport',
  housing: 'Logement',
  subscriptions: 'Abonnements',
  shopping: 'Shopping',
  leisure: 'Loisirs',
  health: 'Santé',
  income: 'Revenus',
  savings_transfers: 'Épargne et transferts',
  other: 'Autres',
};

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v);
}

/**
 * Nature d'une opération, indépendante de sa catégorie :
 * - expense / income : consommation ou revenu réel,
 * - refund : remboursement (réduit une dépense, n'est pas un revenu),
 * - internal_transfer : mouvement entre deux comptes du même utilisateur,
 * - savings_transfer : versement vers un compte d'épargne de l'utilisateur.
 */
export type TransactionKind = 'expense' | 'income' | 'refund' | 'internal_transfer' | 'savings_transfer';

export type TransactionSource = 'bank' | 'manual' | 'demo';
export type TransactionStatus = 'booked' | 'pending';

/** Opération telle que stockée : données du prestataire ou saisie manuelle, jamais modifiées par une correction. */
export interface Transaction {
  id: string;
  source: TransactionSource;
  connectionId?: string | null;
  accountId?: string | null;
  providerTransactionId?: string | null;
  date: DateStr;
  label: string;
  /** Signé : négatif = débit, positif = crédit. */
  amountMinor: number;
  currency: string;
  providerCategory?: string | null;
  operationType?: string | null;
  status: TransactionStatus;
  /** Retirée par le prestataire (ex. opération en attente annulée) : conservée pour l'historique, exclue des calculs. */
  removed?: boolean;
  providerUpdatedAt?: string | null;
  syncedAt?: string | null;
  createdAt: string;
}

/** Correction de l'utilisateur, stockée à part pour survivre aux synchronisations. */
export interface CategoryOverride {
  transactionId: string;
  category?: CategoryId;
  kind?: TransactionKind;
  updatedAt: string;
}

export interface BankAccountRef {
  id: string;
  type: AccountType;
  iban?: string | null;
}

export type AccountType = 'checking' | 'savings' | 'card' | 'loan' | 'investment' | 'other';
