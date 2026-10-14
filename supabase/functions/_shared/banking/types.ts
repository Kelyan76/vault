import type { DateStr } from '../domain/dates.ts';
import type { AccountType } from '../domain/transactions.ts';

/** Statuts de connexion affichés à l'utilisateur, communs à tous les prestataires. */
export const CONNECTION_STATUSES = [
  'not_connected',
  'pending_authorization',
  'connected',
  'syncing',
  'consent_expired',
  'action_required',
  'sync_error',
  'disconnected',
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export type ProviderId = 'bridge' | 'powens' | 'demo';

export interface ProviderConnection {
  providerConnectionId: string;
  status: ConnectionStatus;
  /** Code brut du prestataire, conservé pour le diagnostic (jamais affiché tel quel). */
  providerStatusCode: string | null;
  institutionName: string | null;
  lastSuccessfulSyncAt: string | null;
  consentExpiresAt: string | null;
}

export interface ProviderAccount {
  providerAccountId: string;
  providerConnectionId: string;
  name: string | null;
  type: AccountType;
  /** Solde en unités mineures, null quand le prestataire ne le fournit pas. */
  balanceMinor: number | null;
  currency: string | null;
  /** IBAN masqué (4 derniers caractères) : l'IBAN complet n'est pas nécessaire à l'appli. */
  ibanLast4: string | null;
  dataAccess: boolean;
  providerUpdatedAt: string | null;
}

export interface ProviderTransaction {
  providerTransactionId: string;
  providerAccountId: string;
  date: DateStr;
  label: string;
  amountMinor: number;
  currency: string;
  providerCategory: string | null;
  operationType: string | null;
  status: 'booked' | 'pending';
  /** Le prestataire signale que l'opération n'existe plus (ex. opération en attente annulée). */
  deleted: boolean;
  providerUpdatedAt: string | null;
}

export interface TransactionPage {
  transactions: ProviderTransaction[];
  nextCursor: string | null;
}

export interface ConnectSessionRequest {
  providerUserId: string;
  /** Identifiant interne de l'utilisateur VAULT. */
  appUserId: string;
  email?: string | null;
  callbackUrl: string;
  /** Jeton opaque relu au retour pour relier le callback à la tentative. */
  state: string;
  /** Connexion existante à réparer ou renouveler. */
  providerConnectionId?: string | null;
}

/**
 * Contrat interne : les écrans, les quêtes et le moteur de transactions ne dépendent que de lui.
 * Un nouveau prestataire = une nouvelle implémentation, sans réécrire le reste.
 */
export interface BankingProvider {
  readonly id: ProviderId;
  ensureUser(appUserId: string, existingProviderUserId?: string | null): Promise<{ providerUserId: string }>;
  createConnectSession(req: ConnectSessionRequest): Promise<{ url: string; sessionId: string | null }>;
  getConnection(providerUserId: string, providerConnectionId: string): Promise<ProviderConnection>;
  listAccounts(providerUserId: string, providerConnectionId: string): Promise<ProviderAccount[]>;
  /** Une page de transactions ; `since` = synchronisation incrémentale (date de mise à jour). */
  listTransactions(providerUserId: string, opts: { since?: string | null; cursor?: string | null; minDate?: DateStr | null }): Promise<TransactionPage>;
  deleteConnection(providerUserId: string, providerConnectionId: string): Promise<void>;
  deleteUser(providerUserId: string): Promise<void>;
}

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  readonly code: string;
  constructor(message: string, opts: { retryable: boolean; httpStatus?: number | null; code?: string }) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = opts.retryable;
    this.httpStatus = opts.httpStatus ?? null;
    this.code = opts.code ?? 'provider_error';
  }
}
