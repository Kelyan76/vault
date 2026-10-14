import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { ConnectionRecord, SyncRepository, SyncTrigger } from '../banking/orchestrator.ts';
import type { StoredBankTransaction } from '../banking/sync.ts';
import type { ProviderAccount } from '../banking/types.ts';

/** Implémentation Postgres du dépôt de synchronisation (clé service_role). */
export function supabaseSyncRepository(db: SupabaseClient, provider: 'bridge' | 'powens'): SyncRepository {
  const accountMap = new Map<string, string>(); // provider_account_id -> id interne

  async function ensureAccountMap(connectionId: string) {
    if (accountMap.size) return;
    const { data } = await db.from('bank_accounts').select('id, provider_account_id').eq('connection_id', connectionId);
    for (const a of data ?? []) accountMap.set(a.provider_account_id, a.id);
  }

  return {
    async getConnection(id) {
      const { data } = await db
        .from('bank_connections')
        .select('id, user_id, provider_connection_id, status, sync_cursor, disconnected_at')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        providerConnectionId: data.provider_connection_id,
        status: data.status,
        syncCursor: data.sync_cursor,
        disconnectedAt: data.disconnected_at,
      } satisfies ConnectionRecord;
    },
    async getProviderUserId(userId) {
      const { data } = await db.from('bank_provider_users').select('provider_user_id').eq('user_id', userId).eq('provider', provider).maybeSingle();
      return data?.provider_user_id ?? null;
    },
    async beginSync(connectionId, trigger: SyncTrigger) {
      const { data, error } = await db.rpc('begin_sync', { p_connection: connectionId, p_trigger: trigger });
      if (error) throw new Error('begin_sync');
      return (data as string | null) ?? null;
    },
    async finishSync(jobId, r) {
      await db
        .from('sync_jobs')
        .update({
          status: r.status,
          inserted_count: r.inserted,
          updated_count: r.updated,
          removed_count: r.removed,
          error_code: r.errorCode ?? null,
          next_retry_at: r.nextRetryAt ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    },
    async updateConnection(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.providerStatusCode !== undefined) row.provider_status_code = patch.providerStatusCode;
      if (patch.consentExpiresAt !== undefined) row.consent_expires_at = patch.consentExpiresAt;
      if (patch.lastSuccessfulSyncAt !== undefined) row.last_successful_sync_at = patch.lastSuccessfulSyncAt;
      if (patch.syncCursor !== undefined) row.sync_cursor = patch.syncCursor;
      if (patch.institutionName) row.institution_name = patch.institutionName;
      if (Object.keys(row).length) await db.from('bank_connections').update(row).eq('id', id);
    },
    async upsertAccounts(conn, accounts: ProviderAccount[], now) {
      if (!accounts.length) return;
      const { data, error } = await db
        .from('bank_accounts')
        .upsert(
          accounts.map((a) => ({
            user_id: conn.userId,
            connection_id: conn.id,
            provider_account_id: a.providerAccountId,
            name: a.name,
            type: a.type,
            balance_minor: a.balanceMinor,
            currency: a.currency,
            iban_last4: a.ibanLast4,
            data_access: a.dataAccess,
            provider_updated_at: a.providerUpdatedAt,
            synced_at: now,
          })),
          { onConflict: 'connection_id,provider_account_id' },
        )
        .select('id, provider_account_id');
      if (error) throw new Error('upsert_accounts');
      accountMap.clear();
      for (const a of data ?? []) accountMap.set(a.provider_account_id, a.id);
    },
    async loadTransactions(connectionId, ids) {
      const out: StoredBankTransaction[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await db
          .from('bank_transactions')
          .select('id, provider_transaction_id, provider_account_id, booking_date, label, amount_minor, currency, provider_category, operation_type, status, removed, provider_updated_at, synced_at')
          .eq('connection_id', connectionId)
          .in('provider_transaction_id', ids.slice(i, i + 500));
        if (error) throw new Error('load_transactions');
        for (const t of data ?? []) {
          out.push({
            id: t.id,
            providerTransactionId: t.provider_transaction_id,
            providerAccountId: t.provider_account_id,
            date: t.booking_date,
            label: t.label,
            amountMinor: Number(t.amount_minor),
            currency: t.currency,
            providerCategory: t.provider_category,
            operationType: t.operation_type,
            status: t.status,
            removed: t.removed,
            providerUpdatedAt: t.provider_updated_at,
            syncedAt: t.synced_at,
          });
        }
      }
      return out;
    },
    async saveTransactions(conn, rows) {
      await ensureAccountMap(conn.id);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from('bank_transactions').upsert(
          rows.slice(i, i + 500).map((t) => ({
            user_id: conn.userId,
            connection_id: conn.id,
            account_id: accountMap.get(t.providerAccountId) ?? null,
            provider_transaction_id: t.providerTransactionId,
            provider_account_id: t.providerAccountId,
            booking_date: t.date,
            label: t.label,
            amount_minor: t.amountMinor,
            currency: t.currency,
            provider_category: t.providerCategory,
            operation_type: t.operationType,
            status: t.status,
            removed: t.removed,
            provider_updated_at: t.providerUpdatedAt,
            synced_at: t.syncedAt,
          })),
          // Clé de déduplication : (connexion, identifiant prestataire). L'id interne n'est jamais réécrit.
          { onConflict: 'connection_id,provider_transaction_id' },
        );
        if (error) throw new Error('save_transactions');
      }
      // Date de début de l'historique, utilisée pour juger la fiabilité des quêtes.
      const { data } = await db.from('bank_transactions').select('booking_date').eq('connection_id', conn.id).order('booking_date').limit(1);
      if (data?.[0]) await db.from('bank_connections').update({ first_transaction_date: data[0].booking_date }).eq('id', conn.id);
    },
    async countFailures(connectionId) {
      const { data } = await db.from('sync_jobs').select('status').eq('connection_id', connectionId).order('created_at', { ascending: false }).limit(10);
      let n = 0;
      for (const j of data ?? []) {
        if (j.status === 'succeeded') break;
        if (j.status === 'failed') n++;
      }
      return n;
    },
  };
}
