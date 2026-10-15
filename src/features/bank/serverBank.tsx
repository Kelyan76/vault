import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ConnectionStatus } from '@shared/banking/types.ts';
import { addDays } from '@shared/domain/dates.ts';
import type { AccountType, CategoryId, CategoryOverride, Transaction } from '@shared/domain/transactions.ts';
import { useAuth } from '@/features/auth/auth';
import { todayStr } from '@/lib/ids';
import { callFunction, supabase } from '@/lib/supabase';
import { useStore } from '@/store/store';
import type { ServerBank } from '@/store/derive';

export interface ServerConnection {
  id: string;
  provider: string;
  status: ConnectionStatus;
  institution: string;
  lastSuccessfulSyncAt: string | null;
  consentExpiresAt: string | null;
  firstTransactionDate: string | null;
  disconnectedAt: string | null;
}

export interface ServerAccount {
  id: string;
  connectionId: string;
  name: string;
  type: AccountType;
  balanceMinor: number | null;
  currency: string | null;
  ibanLast4: string | null;
  syncedAt: string | null;
}

interface ServerBankValue {
  /** Compte VAULT connecté dans l'espace « Mes données » : les données bancaires viennent du serveur. */
  active: boolean;
  loading: boolean;
  error: string | null;
  data: (ServerBank & { connectionsFull: ServerConnection[]; accountsFull: ServerAccount[] }) | null;
  reload: () => void;
  /** Corrige la catégorie d'une opération bancaire (enregistrée sur le serveur, conservée aux synchros). */
  setCategory: (transactionId: string, category: CategoryId | null) => Promise<string | null>;
}

const Ctx = createContext<ServerBankValue | null>(null);

/** Historique chargé : 13 mois, pour comparer les périodes et alimenter les prévisions. */
const HISTORY_DAYS = 400;
const PAGE = 1000;

export function ServerBankProvider({ children }: { children: ReactNode }) {
  const { space } = useStore();
  const auth = useAuth();
  const active = space === 'personal' && auth.configured && !!auth.session;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: ServerBankValue['data'] }>({ loading: false, error: null, data: null });
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [autoSynced, setAutoSynced] = useState<Set<string>>(new Set());

  // Synchronisation automatique à l'ouverture si la dernière date de plus de 6 h (une fois par session).
  useEffect(() => {
    const stale = (state.data?.connectionsFull ?? []).filter(
      (c) =>
        !c.disconnectedAt &&
        (c.status === 'connected' || c.status === 'sync_error' || c.status === 'syncing') &&
        !autoSynced.has(c.id) &&
        (!c.lastSuccessfulSyncAt || Date.now() - new Date(c.lastSuccessfulSyncAt).getTime() > 6 * 3600_000),
    );
    if (!active || stale.length === 0) return;
    setAutoSynced((prev) => new Set([...prev, ...stale.map((c) => c.id)]));
    Promise.all(stale.map((c) => callFunction('bank-sync', { connectionId: c.id }).catch(() => null))).then(() => reload());
  }, [active, state.data, autoSynced, reload]);

  useEffect(() => {
    const sb = supabase();
    if (!active || !sb) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const since = addDays(todayStr(), -HISTORY_DAYS);
      const [c, a, o] = await Promise.all([
        sb.from('my_bank_connections').select('id, provider, status, institution_name, consent_expires_at, last_successful_sync_at, first_transaction_date, disconnected_at').order('created_at'),
        sb.from('bank_accounts').select('id, connection_id, name, type, balance_minor, currency, iban_last4, synced_at'),
        sb.from('transaction_category_overrides').select('bank_transaction_id, category, kind, updated_at'),
      ]);
      // Opérations paginées (le serveur renvoie au plus 1000 lignes par requête).
      const rows: Record<string, unknown>[] = [];
      let txError = false;
      for (let from = 0; from < 20 * PAGE; from += PAGE) {
        const { data, error } = await sb
          .from('bank_transactions')
          .select('id, account_id, connection_id, booking_date, label, amount_minor, currency, provider_category, operation_type, status, source, synced_at, created_at')
          .eq('removed', false)
          .gte('booking_date', since)
          .order('booking_date', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) {
          txError = true;
          break;
        }
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      if (cancelled) return;
      if (c.error || a.error || o.error || txError) {
        setState({ loading: false, error: 'Impossible de charger tes données bancaires. Vérifie ta connexion internet.', data: null });
        return;
      }
      const connectionsFull: ServerConnection[] = (c.data ?? []).map((r) => ({
        id: r.id,
        provider: r.provider,
        status: r.status,
        institution: r.institution_name ?? 'Ma banque',
        lastSuccessfulSyncAt: r.last_successful_sync_at,
        consentExpiresAt: r.consent_expires_at,
        firstTransactionDate: r.first_transaction_date,
        disconnectedAt: r.disconnected_at,
      }));
      const accountsFull: ServerAccount[] = (a.data ?? []).map((r) => ({
        id: r.id,
        connectionId: r.connection_id,
        name: r.name ?? 'Compte',
        type: r.type,
        balanceMinor: r.balance_minor === null ? null : Number(r.balance_minor),
        currency: r.currency,
        ibanLast4: r.iban_last4,
        syncedAt: r.synced_at,
      }));
      const transactions: Transaction[] = rows.map((r) => ({
        id: String(r.id),
        source: 'bank',
        connectionId: r.connection_id as string,
        accountId: (r.account_id as string | null) ?? null,
        date: String(r.booking_date),
        label: String(r.label),
        amountMinor: Number(r.amount_minor),
        currency: String(r.currency),
        providerCategory: (r.provider_category as string | null) ?? null,
        operationType: (r.operation_type as string | null) ?? null,
        status: r.status as 'booked' | 'pending',
        syncedAt: (r.synced_at as string | null) ?? null,
        createdAt: String(r.created_at),
      }));
      const overrides: CategoryOverride[] = (o.data ?? []).map((r) => ({
        transactionId: r.bank_transaction_id,
        category: r.category ?? undefined,
        kind: r.kind ?? undefined,
        updatedAt: r.updated_at,
      }));
      setState({
        loading: false,
        error: null,
        data: {
          transactions,
          accounts: accountsFull.map((x) => ({ id: x.id, type: x.type })),
          overrides,
          connections: connectionsFull,
          connectionsFull,
          accountsFull,
        },
      });
    })().catch(() => {
      if (!cancelled) setState({ loading: false, error: 'Impossible de charger tes données bancaires.', data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [active, tick, auth.session?.user.id]);

  const setCategory = useCallback(
    async (transactionId: string, category: CategoryId | null) => {
      const sb = supabase();
      const userId = auth.session?.user.id;
      if (!sb || !userId) return 'Connecte-toi pour corriger tes opérations.';
      const { error } = category
        ? await sb.from('transaction_category_overrides').upsert({ user_id: userId, bank_transaction_id: transactionId, category, updated_at: new Date().toISOString() }, { onConflict: 'bank_transaction_id' })
        : await sb.from('transaction_category_overrides').delete().eq('bank_transaction_id', transactionId);
      if (error) return 'La correction n’a pas pu être enregistrée. Réessaie.';
      // Mise à jour immédiate de l'affichage, sans attendre un rechargement complet.
      setState((s) =>
        s.data
          ? {
              ...s,
              data: {
                ...s.data,
                overrides: [
                  ...s.data.overrides.filter((x) => x.transactionId !== transactionId),
                  ...(category ? [{ transactionId, category, updatedAt: new Date().toISOString() }] : []),
                ],
              },
            }
          : s,
      );
      return null;
    },
    [auth.session?.user.id],
  );

  const value = useMemo<ServerBankValue>(() => ({ active, ...state, reload, setCategory }), [active, state, reload, setCategory]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServerBank(): ServerBankValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('ServerBankProvider manquant');
  return v;
}
