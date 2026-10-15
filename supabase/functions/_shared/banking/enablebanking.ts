import { addDays, type DateStr } from '../domain/dates.ts';
import { toMinor } from '../domain/money.ts';
import type { AccountType } from '../domain/transactions.ts';
import { importRsaPrivateKey, signJwtRs256 } from './jwt.ts';
import {
  ProviderError,
  type BankingProvider,
  type CallbackResult,
  type ConnectionStatus,
  type ConnectSessionRequest,
  type Institution,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
  type TransactionPage,
} from './types.ts';

// Client Enable Banking (API d'information sur les comptes), écrit d'après la référence officielle
// https://enablebanking.com/docs/api/reference/ (consultée le 2026-10-15). Endpoints utilisés :
//   GET    /aspsps?country=            banques disponibles
//   POST   /auth                        début du consentement → url
//   POST   /sessions                    échange du code de retour → session_id + comptes
//   GET    /sessions/{id}               état de la session (AUTHORIZED, EXPIRED, REVOKED…)
//   DELETE /sessions/{id}               fermeture (révocation côté application)
//   GET    /accounts/{uid}/details      nom, devise, type
//   GET    /accounts/{uid}/balances
//   GET    /accounts/{uid}/transactions?date_from=&continuation_key=
// Authentification : JWT RS256, kid = identifiant de l'application, iss « enablebanking.com »,
// aud « api.enablebanking.com », durée maximale 24 h.
// Pas d'utilisateur côté prestataire : la session est la connexion. Pas de webhooks documentés :
// la synchronisation est déclenchée par l'appli et par une tâche planifiée.

export interface EnableBankingConfig {
  applicationId: string;
  privateKeyPem: string;
  baseUrl?: string;
  /** Durée du consentement demandé, en jours (180 au plus chez la plupart des banques). */
  consentDays?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface EbAccountRef {
  uid: string;
}

interface EbSession {
  status: string;
  access?: { valid_until?: string };
  aspsp?: { name?: string; country?: string };
  accounts?: (string | EbAccountRef)[];
}

interface EbAmount {
  amount: string;
  currency: string;
}

export interface EbTransaction {
  transaction_id?: string | null;
  entry_reference?: string | null;
  transaction_amount: EbAmount;
  credit_debit_indicator?: 'CRDT' | 'DBIT' | string | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  bank_transaction_code?: { description?: string | null } | null;
}

export function mapSessionStatus(status: string, validUntil: string | null, now: Date): ConnectionStatus {
  if (validUntil && new Date(validUntil).getTime() <= now.getTime()) return 'consent_expired';
  switch (status) {
    case 'AUTHORIZED':
      return 'connected';
    case 'PENDING_AUTHORIZATION':
      return 'pending_authorization';
    case 'RETURNED_FROM_BANK':
      return 'syncing';
    case 'EXPIRED':
      return 'consent_expired';
    case 'REVOKED':
    case 'CLOSED':
      return 'disconnected';
    case 'CANCELLED':
    case 'INVALID':
    default:
      return 'action_required';
  }
}

function amountMinor(a: EbAmount, indicator: string | null | undefined): number {
  const value = Math.abs(Number(a.amount));
  if (!Number.isFinite(value)) throw new ProviderError('Montant illisible', { retryable: false, code: 'bad_amount' });
  const minor = toMinor(value, a.currency);
  // Montant positif + indicateur de sens. Par prudence, un montant déjà négatif reste un débit.
  return indicator === 'DBIT' || Number(a.amount) < 0 ? -minor : minor;
}

function label(t: EbTransaction): string {
  const remit = (t.remittance_information ?? []).filter(Boolean).join(' ').trim();
  const party = t.credit_debit_indicator === 'DBIT' ? t.creditor?.name : t.debtor?.name;
  return (remit || party || t.bank_transaction_code?.description || 'Opération').replace(/\s+/g, ' ').slice(0, 200);
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * Normalise une page de transactions d'un compte. Quand la banque ne fournit pas d'identifiant,
 * on dérive une empreinte stable (compte, date, montant, libellé, rang parmi les opérations identiques).
 */
export async function mapEbTransactions(accountUid: string, txs: EbTransaction[]): Promise<ProviderTransaction[]> {
  const seen = new Map<string, number>();
  const out: ProviderTransaction[] = [];
  for (const t of txs) {
    const status = (t.status ?? 'BOOK').toUpperCase();
    const date = (t.booking_date ?? t.value_date ?? t.transaction_date ?? '').slice(0, 10);
    if (!date) continue;
    const amount = amountMinor(t.transaction_amount, t.credit_debit_indicator);
    const text = label(t);
    let id = t.transaction_id || t.entry_reference || null;
    if (!id) {
      const base = `${accountUid}|${date}|${amount}|${t.transaction_amount.currency}|${text}|${status === 'BOOK' ? 'B' : 'P'}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      id = `h:${await sha256Hex(`${base}|${n}`)}`;
    }
    out.push({
      providerTransactionId: `${accountUid}:${id}`,
      providerAccountId: accountUid,
      date,
      label: text,
      amountMinor: amount,
      currency: t.transaction_amount.currency.toUpperCase(),
      providerCategory: null,
      operationType: t.bank_transaction_code?.description ?? null,
      status: status === 'BOOK' || status === 'OTHR' ? 'booked' : 'pending',
      deleted: status === 'CNCL' || status === 'RJCT',
      providerUpdatedAt: null,
    });
  }
  return out;
}

const BALANCE_PRIORITY = ['CLBD', 'ITBD', 'CLAV', 'ITAV', 'XPCD', 'OPBD'];

/** Curseur de pagination : on parcourt les comptes l'un après l'autre. */
interface Cursor {
  i: number;
  k: string | null;
  from: DateStr;
}

export class EnableBankingProvider implements BankingProvider {
  readonly id = 'enablebanking' as const;
  /** Pas de signal de suppression : la fenêtre relue est réconciliée par l'orchestrateur. */
  readonly reportsDeletions = false;
  readonly stateParam = 'state';
  private readonly cfg: Required<Omit<EnableBankingConfig, 'fetchImpl' | 'now'>> & { fetchImpl: typeof fetch; now: () => Date };
  private key: Promise<CryptoKey> | null = null;
  private token: { value: string; exp: number } | null = null;

  constructor(cfg: EnableBankingConfig) {
    if (!cfg.applicationId || !cfg.privateKeyPem) throw new ProviderError('Enable Banking non configuré', { retryable: false, code: 'not_configured' });
    this.cfg = {
      applicationId: cfg.applicationId,
      privateKeyPem: cfg.privateKeyPem,
      baseUrl: cfg.baseUrl ?? 'https://api.enablebanking.com',
      consentDays: cfg.consentDays ?? 180,
      fetchImpl: cfg.fetchImpl ?? fetch,
      now: cfg.now ?? (() => new Date()),
    };
  }

  private async jwt(): Promise<string> {
    const nowS = Math.floor(this.cfg.now().getTime() / 1000);
    if (this.token && this.token.exp - 60 > nowS) return this.token.value;
    this.key ??= importRsaPrivateKey(this.cfg.privateKeyPem);
    const exp = nowS + 3600;
    const value = await signJwtRs256(await this.key, { kid: this.cfg.applicationId }, { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: nowS, exp });
    this.token = { value, exp };
    return value;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.cfg.fetchImpl(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${await this.jwt()}`, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError('Enable Banking injoignable', { retryable: true, code: 'network' });
    }
    const text = await res.text();
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const err = JSON.parse(text) as { error?: string };
        if (err.error) code = String(err.error);
      } catch {
        /* corps non JSON */
      }
      throw new ProviderError(`Enable Banking a répondu ${res.status}`, { retryable: res.status === 408 || res.status === 429 || res.status >= 500, httpStatus: res.status, code });
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async ensureUser(appUserId: string) {
    // Pas de notion d'utilisateur chez Enable Banking : l'identifiant VAULT sert de référence.
    return { providerUserId: appUserId };
  }

  async listInstitutions(country: string): Promise<Institution[]> {
    const res = await this.call<{ aspsps: { name: string; country: string; logo?: string; psu_types?: string[] }[] }>(
      'GET',
      `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`,
    );
    return res.aspsps.map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  async createConnectSession(req: ConnectSessionRequest) {
    if (!req.institution) throw new ProviderError('Choisis ta banque', { retryable: false, code: 'institution_required' });
    const validUntil = new Date(this.cfg.now().getTime() + this.cfg.consentDays * 86_400_000).toISOString();
    const res = await this.call<{ url: string; authorization_id?: string }>('POST', '/auth', {
      access: { valid_until: validUntil },
      aspsp: { name: req.institution.name, country: req.institution.country },
      state: req.state,
      redirect_url: req.callbackUrl,
      psu_type: 'personal',
    });
    return { url: res.url, sessionId: res.authorization_id ?? null };
  }

  async completeCallback(params: URLSearchParams): Promise<CallbackResult> {
    const code = params.get('code');
    if (!code || params.get('error')) return { ok: false, reason: params.get('error') ? 'cancelled' : 'error' };
    const res = await this.call<{ session_id: string }>('POST', '/sessions', { code });
    if (!res.session_id) return { ok: false, reason: 'error' };
    return { ok: true, providerConnectionId: res.session_id };
  }

  private async session(sessionId: string): Promise<EbSession> {
    return this.call<EbSession>('GET', `/sessions/${encodeURIComponent(sessionId)}`);
  }

  async getConnection(_providerUserId: string, providerConnectionId: string): Promise<ProviderConnection> {
    const s = await this.session(providerConnectionId);
    const validUntil = s.access?.valid_until ?? null;
    return {
      providerConnectionId,
      status: mapSessionStatus(s.status, validUntil, this.cfg.now()),
      providerStatusCode: s.status,
      institutionName: s.aspsp?.name ?? null,
      lastSuccessfulSyncAt: null,
      consentExpiresAt: validUntil,
    };
  }

  private async accountUids(sessionId: string): Promise<string[]> {
    const s = await this.session(sessionId);
    return (s.accounts ?? []).map((a) => (typeof a === 'string' ? a : a.uid)).filter(Boolean);
  }

  async listAccounts(_providerUserId: string, providerConnectionId: string): Promise<ProviderAccount[]> {
    const uids = await this.accountUids(providerConnectionId);
    const out: ProviderAccount[] = [];
    for (const uid of uids) {
      const id = encodeURIComponent(uid);
      const details = await this.call<{ name?: string; product?: string; currency?: string; cash_account_type?: string; account_id?: { iban?: string } }>('GET', `/accounts/${id}/details`);
      let balanceMinor: number | null = null;
      let currency = details.currency?.toUpperCase() ?? null;
      try {
        const b = await this.call<{ balances: { balance_amount: EbAmount; balance_type?: string }[] }>('GET', `/accounts/${id}/balances`);
        const pick = [...b.balances].sort((x, y) => rank(x.balance_type) - rank(y.balance_type))[0];
        if (pick) {
          currency = pick.balance_amount.currency.toUpperCase();
          balanceMinor = toMinor(Number(pick.balance_amount.amount), currency);
        }
      } catch {
        // Certaines banques ne donnent pas le solde : on l'affiche « indisponible ».
      }
      out.push({
        providerAccountId: uid,
        providerConnectionId,
        name: details.name ?? details.product ?? null,
        type: accountType(details.cash_account_type),
        balanceMinor,
        currency,
        ibanLast4: details.account_id?.iban ? details.account_id.iban.replace(/\s/g, '').slice(-4) : null,
        dataAccess: true,
        providerUpdatedAt: null,
      });
    }
    return out;
  }

  async listTransactions(
    _providerUserId: string,
    opts: { since?: string | null; cursor?: string | null; minDate?: DateStr | null; providerConnectionId?: string; accountIds?: string[] },
  ): Promise<TransactionPage> {
    const accounts = opts.accountIds ?? (opts.providerConnectionId ? await this.accountUids(opts.providerConnectionId) : []);
    if (accounts.length === 0) return { transactions: [], nextCursor: null };
    let cur: Cursor;
    if (opts.cursor) {
      cur = JSON.parse(opts.cursor) as Cursor;
    } else {
      const today = this.cfg.now().toISOString().slice(0, 10);
      // Incrémental : on relit 10 jours avant la dernière synchro, car les opérations en attente
      // deviennent définitives avec retard ; la fusion idempotente absorbe le recouvrement.
      const from = opts.since ? addDays(opts.since.slice(0, 10), -10) : opts.minDate ?? addDays(today, -89);
      cur = { i: 0, k: null, from };
    }
    const uid = accounts[cur.i];
    if (!uid) return { transactions: [], nextCursor: null };
    const q = new URLSearchParams({ date_from: cur.from });
    if (cur.k) q.set('continuation_key', cur.k);
    const res = await this.call<{ transactions: EbTransaction[]; continuation_key?: string | null }>('GET', `/accounts/${encodeURIComponent(uid)}/transactions?${q}`);
    const transactions = await mapEbTransactions(uid, res.transactions ?? []);
    let next: Cursor | null = null;
    if (res.continuation_key) next = { ...cur, k: res.continuation_key };
    else if (cur.i + 1 < accounts.length) next = { i: cur.i + 1, k: null, from: cur.from };
    return { transactions, nextCursor: next ? JSON.stringify(next) : null };
  }

  async deleteConnection(_providerUserId: string, providerConnectionId: string) {
    try {
      await this.call('DELETE', `/sessions/${encodeURIComponent(providerConnectionId)}`);
    } catch (e) {
      if (e instanceof ProviderError && e.httpStatus === 404) return;
      throw e;
    }
  }

  async deleteUser() {
    // Rien à supprimer côté prestataire hors des sessions, fermées une à une par deleteConnection.
  }
}

function rank(type?: string): number {
  const i = BALANCE_PRIORITY.indexOf(type ?? '');
  return i === -1 ? 99 : i;
}

/** Codes ISO 20022 de type de compte ; inconnu → « autre ». */
function accountType(code?: string): AccountType {
  switch (code) {
    case 'CACC':
    case 'TRAN':
      return 'checking';
    case 'SVGS':
    case 'MOMA':
    case 'LLSV':
      return 'savings';
    case 'CARD':
      return 'card';
    case 'LOAN':
      return 'loan';
    default:
      return 'other';
  }
}
