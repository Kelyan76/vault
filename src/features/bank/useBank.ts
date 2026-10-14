import { useCallback, useEffect, useState } from 'react';
import type { ConnectionStatus } from '@shared/banking/types.ts';
import type { AccountType } from '@shared/domain/transactions.ts';
import { useAuth } from '@/features/auth/auth';
import { supabase } from '@/lib/supabase';
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
  const [state, setState] = useState<{ loading: boolean; error: string | null; connections: BankConnectionView[]; accounts: BankAccountView[] }>({ loading: false, error: null, connections: [], accounts: [] });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const serverMode = space === 'personal' && auth.configured && !!auth.session;

  useEffect(() => {
    if (!serverMode) return;
    const sb = supabase();
    if (!sb) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const [c, a] = await Promise.all([
        sb.from('my_bank_connections').select('id, provider, status, institution_name, consent_expires_at, last_successful_sync_at, disconnected_at').order('created_at'),
        sb.from('bank_accounts').select('id, connection_id, name, type, balance_minor, currency, iban_last4, synced_at'),
      ]);
      if (cancelled) return;
      if (c.error || a.error) {
        setState({ loading: false, error: 'Impossible de charger tes connexions bancaires.', connections: [], accounts: [] });
        return;
      }
      setState({
        loading: false,
        error: null,
        connections: (c.data ?? []).map((r) => ({
          id: r.id,
          institution: r.institution_name ?? 'Ma banque',
          status: r.status,
          lastSyncAt: r.last_successful_sync_at,
          consentExpiresAt: r.consent_expires_at,
          disconnectedAt: r.disconnected_at,
          demo: false,
        })),
        accounts: (a.data ?? []).map((r) => ({
          id: r.id,
          connectionId: r.connection_id,
          name: r.name ?? 'Compte',
          type: r.type,
          balanceMinor: r.balance_minor === null ? null : Number(r.balance_minor),
          currency: r.currency,
          ibanLast4: r.iban_last4,
          syncedAt: r.synced_at,
          demo: false,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [serverMode, tick]);

  if (space === 'demo') {
    return {
      source: 'demo',
      unavailableReason: null,
      loading: false,
      error: null,
      reload,
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
  if (serverMode) return { source: 'server', unavailableReason: null, reload, ...state };
  return {
    source: 'unavailable',
    unavailableReason: !auth.configured
      ? 'Le serveur VAULT n’est pas encore configuré : la connexion bancaire réelle est indisponible. Tu peux essayer le parcours dans l’espace démo ou saisir tes dépenses à la main.'
      : 'Crée un compte VAULT (ou connecte-toi) pour relier ta banque de façon sécurisée.',
    loading: false,
    error: null,
    connections: [],
    accounts: [],
    reload,
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
