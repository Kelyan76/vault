import type { ConnectionStatus } from '@shared/banking/types.ts';
import type { AccountType } from '@shared/domain/transactions.ts';
import { useAuth } from '@/features/auth/auth';
import { useServerBank } from './serverBank';
import { useStore } from '@/store/store';

export interface BankConnectionView {
  id: string;
  institution: string;
  status: ConnectionStatus;
  lastSyncAt: string | null;
  consentExpiresAt: string | null;
  disconnectedAt: string | null;
  /** Données fictives du mode démo. */
  demo: boolean;
}

export interface BankAccountView {
  id: string;
  connectionId: string;
  name: string;
  type: AccountType;
  balanceMinor: number | null;
  currency: string | null;
  ibanLast4: string | null;
  syncedAt: string | null;
  demo: boolean;
}

export type BankSource = 'demo' | 'server' | 'unavailable';

export interface BankView {
  source: BankSource;
  /** Raison lisible quand la connexion réelle n'est pas possible. */
  unavailableReason: string | null;
  loading: boolean;
  error: string | null;
  connections: BankConnectionView[];
  accounts: BankAccountView[];
  reload: () => void;
}

/**
 * Point d'entrée unique des écrans bancaires :
 * - espace démo : banque fictive locale, toujours étiquetée comme telle ;
 * - espace personnel avec compte : connexions réelles lues dans Supabase (RLS : uniquement les siennes) ;
 * - sinon : indisponible, avec l'explication.
 */
export function useBank(): BankView {
  const { space, data } = useStore();
  const auth = useAuth();
  const server = useServerBank();

  if (space === 'demo') {
    return {
      source: 'demo',
      unavailableReason: null,
      loading: false,
      error: null,
      reload: server.reload,
      connections: data.bank.connections.map((c) => ({
        id: c.id,
        institution: c.institutionName,
        status: c.status,
        lastSyncAt: c.lastSuccessfulSyncAt,
        consentExpiresAt: c.consentExpiresAt,
        disconnectedAt: c.disconnectedAt,
        demo: true,
      })),
      accounts: data.bank.accounts.map((a) => ({
        id: a.id,
        connectionId: a.connectionId,
        name: a.name ?? 'Compte',
        type: a.type,
        balanceMinor: a.balanceMinor,
        currency: a.currency,
        ibanLast4: a.ibanLast4,
        syncedAt: a.syncedAt,
        demo: true,
      })),
    };
  }
  if (server.active) {
    return {
      source: 'server',
      unavailableReason: null,
      loading: server.loading,
      error: server.error,
      reload: server.reload,
      connections: (server.data?.connectionsFull ?? []).map((c) => ({
        id: c.id,
        institution: c.institution,
        status: c.status,
        lastSyncAt: c.lastSuccessfulSyncAt,
        consentExpiresAt: c.consentExpiresAt,
        disconnectedAt: c.disconnectedAt,
        demo: false,
      })),
      accounts: (server.data?.accountsFull ?? []).map((a) => ({ ...a, demo: false })),
    };
  }
  return {
    source: 'unavailable',
    unavailableReason: !auth.configured
      ? 'Le serveur VAULT n’est pas encore configuré : la connexion bancaire réelle est indisponible. Tu peux essayer le parcours dans l’espace démo ou saisir tes dépenses à la main.'
      : 'Crée un compte VAULT (ou connecte-toi) pour relier ta banque de façon sécurisée.',
    loading: false,
    error: null,
    connections: [],
    accounts: [],
    reload: server.reload,
  };
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Compte courant',
  savings: 'Épargne',
  card: 'Carte',
  loan: 'Crédit',
  investment: 'Placement',
  other: 'Autre compte',
};
