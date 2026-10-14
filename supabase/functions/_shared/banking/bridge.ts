import { toMinor } from '../domain/money.ts';
import type { AccountType } from '../domain/transactions.ts';
import { bridgeItemStatus } from './status.ts';
import {
  ProviderError,
  type BankingProvider,
  type ConnectSessionRequest,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
  type TransactionPage,
} from './types.ts';

// Client Bridge API v3 (agrégation), écrit d'après la référence officielle docs.bridgeapi.io
// (version d'API 2025-01-15). Endpoints utilisés, tous vérifiés dans la documentation :
//   POST   /v3/aggregation/users
//   POST   /v3/aggregation/authorization/token
//   POST   /v3/aggregation/connect-sessions
//   GET    /v3/aggregation/items/{id}
//   GET    /v3/aggregation/accounts?item_id=
//   GET    /v3/aggregation/transactions?since=&min_date=&limit=   (pagination.next_uri)
//   DELETE /v3/aggregation/items/{id}
//   DELETE /v3/aggregation/users/{uuid}
// Non testé contre la sandbox tant qu'aucun identifiant client n'est configuré.

export interface BridgeConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  version?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const BRIDGE_ACCOUNT_TYPES: Record<string, AccountType> = {
  checking: 'checking',
  savings: 'savings',
  card: 'card',
  loan: 'loan',
  brokerage: 'investment',
  pea: 'investment',
  life_insurance: 'investment',
};

interface BridgeTx {
  id: number;
  clean_description: string;
  provider_description: string;
  amount: number;
  date: string;
  updated_at: string;
  currency_code: string;
  account_id: number;
  deleted: boolean;
  future: boolean;
  category_id?: number;
  operation_type?: string;
}

interface BridgeAccount {
  id: number;
  name?: string;
  balance?: number | null;
  currency_code?: string;
  type?: string;
  item_id: number;
  iban?: string | null;
  data_access?: 'enabled' | 'disabled';
  updated_at?: string;
}

interface BridgeItem {
  id: number;
  status: number;
  status_code_info?: string;
  provider_id?: number;
  last_successful_refresh?: string | null;
  authentication_expires_at?: string | null;
}

export function mapBridgeTransaction(t: BridgeTx): ProviderTransaction {
  return {
    providerTransactionId: String(t.id),
    providerAccountId: String(t.account_id),
    date: t.date.slice(0, 10),
    label: (t.clean_description || t.provider_description || 'Opération').slice(0, 200),
    amountMinor: toMinor(t.amount, t.currency_code),
    currency: t.currency_code.toUpperCase(),
    providerCategory: t.category_id != null ? String(t.category_id) : null,
    operationType: t.operation_type ?? null,
    // `future` : prélèvement programmé qui n'affecte pas encore le solde.
    status: t.future ? 'pending' : 'booked',
    deleted: !!t.deleted,
    providerUpdatedAt: t.updated_at ?? null,
  };
}

export function mapBridgeAccount(a: BridgeAccount): ProviderAccount {
  const currency = a.currency_code ? a.currency_code.toUpperCase() : null;
  return {
    providerAccountId: String(a.id),
    providerConnectionId: String(a.item_id),
    name: a.name ?? null,
    type: BRIDGE_ACCOUNT_TYPES[a.type ?? ''] ?? 'other',
    balanceMinor: typeof a.balance === 'number' && currency ? toMinor(a.balance, currency) : null,
    currency,
    ibanLast4: a.iban ? a.iban.replace(/\s/g, '').slice(-4) : null,
    dataAccess: a.data_access !== 'disabled',
    providerUpdatedAt: a.updated_at ?? null,
  };
}

export class BridgeProvider implements BankingProvider {
  readonly id = 'bridge' as const;
  private readonly cfg: Required<Omit<BridgeConfig, 'fetchImpl' | 'now'>> & { fetchImpl: typeof fetch; now: () => Date };
  private tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(cfg: BridgeConfig) {
    if (!cfg.clientId || !cfg.clientSecret) throw new ProviderError('Bridge non configuré', { retryable: false, code: 'not_configured' });
    this.cfg = {
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      baseUrl: cfg.baseUrl ?? 'https://api.bridgeapi.io',
      version: cfg.version ?? '2025-01-15',
      fetchImpl: cfg.fetchImpl ?? fetch,
      now: cfg.now ?? (() => new Date()),
    };
  }

  private async call<T>(method: string, path: string, opts: { body?: unknown; userToken?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Bridge-Version': this.cfg.version,
      'Client-Id': this.cfg.clientId,
      'Client-Secret': this.cfg.clientSecret,
      accept: 'application/json',
    };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.userToken) headers.authorization = `Bearer ${opts.userToken}`;
    let res: Response;
    try {
      res = await this.cfg.fetchImpl(`${this.cfg.baseUrl}${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    } catch {
      throw new ProviderError('Bridge injoignable', { retryable: true, code: 'network' });
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) {
      // On ne journalise ni le corps ni les en-têtes : seulement le statut et le code d'erreur.
      let code = `http_${res.status}`;
      try {
        code = (JSON.parse(text) as { errors?: { code?: string }[] }).errors?.[0]?.code ?? code;
      } catch {
        /* corps non JSON */
      }
      throw new ProviderError(`Bridge a répondu ${res.status}`, { retryable: res.status === 429 || res.status >= 500, httpStatus: res.status, code });
    }
    return JSON.parse(text) as T;
  }

  private async userToken(providerUserId: string): Promise<string> {
    const cached = this.tokens.get(providerUserId);
    if (cached && cached.expiresAt - 60_000 > this.cfg.now().getTime()) return cached.token;
    const res = await this.call<{ access_token: string; expires_at: string }>('POST', '/v3/aggregation/authorization/token', { body: { user_uuid: providerUserId } });
    this.tokens.set(providerUserId, { token: res.access_token, expiresAt: new Date(res.expires_at).getTime() });
    return res.access_token;
  }

  async ensureUser(appUserId: string, existing?: string | null) {
    if (existing) return { providerUserId: existing };
    // external_user_id : identifiant interne VAULT, jamais l'e-mail.
    const res = await this.call<{ uuid: string }>('POST', '/v3/aggregation/users', { body: { external_user_id: appUserId } });
    return { providerUserId: res.uuid };
  }

  async createConnectSession(req: ConnectSessionRequest) {
    const token = await this.userToken(req.providerUserId);
    const body: Record<string, unknown> = { callback_url: req.callbackUrl, context: req.state };
    if (req.providerConnectionId) body.item_id = Number(req.providerConnectionId);
    else {
      body.user_email = req.email;
      body.country_code = 'FR';
      body.account_types = 'all';
    }
    const res = await this.call<{ id: string; url: string }>('POST', '/v3/aggregation/connect-sessions', { body, userToken: token });
    return { url: res.url, sessionId: res.id };
  }

  async getConnection(providerUserId: string, providerConnectionId: string): Promise<ProviderConnection> {
    const token = await this.userToken(providerUserId);
    const item = await this.call<BridgeItem>('GET', `/v3/aggregation/items/${encodeURIComponent(providerConnectionId)}`, { userToken: token });
    return {
      providerConnectionId: String(item.id),
      status: bridgeItemStatus(item.status, item.authentication_expires_at ?? null, this.cfg.now()),
      providerStatusCode: `${item.status}${item.status_code_info ? `:${item.status_code_info}` : ''}`,
      institutionName: null,
      lastSuccessfulSyncAt: item.last_successful_refresh ?? null,
      consentExpiresAt: item.authentication_expires_at ?? null,
    };
  }

  async listAccounts(providerUserId: string, providerConnectionId: string): Promise<ProviderAccount[]> {
    const token = await this.userToken(providerUserId);
    const out: ProviderAccount[] = [];
    let path: string | null = `/v3/aggregation/accounts?item_id=${encodeURIComponent(providerConnectionId)}&limit=500`;
    for (let i = 0; path && i < 20; i++) {
      const res: { resources: BridgeAccount[]; pagination?: { next_uri: string | null } } = await this.call('GET', path, { userToken: token });
      out.push(...res.resources.map(mapBridgeAccount));
      path = safeNext(res.pagination?.next_uri ?? null, '/v3/aggregation/accounts');
    }
    return out;
  }

  async listTransactions(providerUserId: string, opts: { since?: string | null; cursor?: string | null; minDate?: string | null }): Promise<TransactionPage> {
    const token = await this.userToken(providerUserId);
    let path = safeNext(opts.cursor ?? null, '/v3/aggregation/transactions');
    if (!path) {
      const q = new URLSearchParams({ limit: '500' });
      if (opts.since) q.set('since', opts.since);
      if (opts.minDate) q.set('min_date', opts.minDate);
      path = `/v3/aggregation/transactions?${q.toString()}`;
    }
    const res = await this.call<{ resources: BridgeTx[]; pagination?: { next_uri: string | null } }>('GET', path, { userToken: token });
    return { transactions: res.resources.map(mapBridgeTransaction), nextCursor: safeNext(res.pagination?.next_uri ?? null, '/v3/aggregation/transactions') };
  }

  async deleteConnection(providerUserId: string, providerConnectionId: string) {
    const token = await this.userToken(providerUserId);
    try {
      await this.call('DELETE', `/v3/aggregation/items/${encodeURIComponent(providerConnectionId)}`, { userToken: token });
    } catch (e) {
      if (e instanceof ProviderError && e.httpStatus === 404) return; // déjà supprimée : idempotent
      throw e;
    }
  }

  async deleteUser(providerUserId: string) {
    try {
      await this.call('DELETE', `/v3/aggregation/users/${encodeURIComponent(providerUserId)}`);
    } catch (e) {
      if (e instanceof ProviderError && e.httpStatus === 404) return;
      throw e;
    }
    this.tokens.delete(providerUserId);
  }
}

/** N'accepte que des chemins relatifs attendus : un `next_uri` ne peut pas rediriger vers un autre hôte. */
export function safeNext(nextUri: string | null, expectedPrefix: string): string | null {
  if (!nextUri) return null;
  if (!nextUri.startsWith(`${expectedPrefix}?`) || nextUri.includes('://') || nextUri.includes('..')) {
    throw new ProviderError('Pagination inattendue', { retryable: false, code: 'bad_pagination' });
  }
  return nextUri;
}
