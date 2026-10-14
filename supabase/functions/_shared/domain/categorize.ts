import { diffDays } from './dates.ts';
import type { BankAccountRef, CategoryId, CategoryOverride, Transaction, TransactionKind } from './transactions.ts';

/**
 * Catégorisation transparente : chaque résultat dit d'où il vient.
 * Ordre de priorité : correction utilisateur > détection de transfert > catégorie prestataire > règle par mots-clés > défaut.
 */
export type CategorySource = 'user' | 'transfer_detection' | 'provider' | 'rule' | 'default';

export interface Classified {
  category: CategoryId;
  kind: TransactionKind;
  source: CategorySource;
  ruleId?: string;
}

export interface KeywordRule {
  id: string;
  category: CategoryId;
  /** Mots recherchés dans le libellé normalisé (sans accents, minuscules). */
  keywords: string[];
  /** Ne s'applique qu'aux débits ou qu'aux crédits. */
  direction?: 'debit' | 'credit';
}

export const DEFAULT_RULES: KeywordRule[] = [
  { id: 'delivery', category: 'restaurants', keywords: ['uber eats', 'ubereats', 'deliveroo', 'just eat', 'frichti'], direction: 'debit' },
  { id: 'restaurants', category: 'restaurants', keywords: ['restaurant', 'brasserie', 'pizzeria', 'mcdonald', 'burger king', 'kfc', 'sushi', 'boulangerie', 'cafe '], direction: 'debit' },
  { id: 'groceries', category: 'groceries', keywords: ['carrefour', 'leclerc', 'intermarche', 'auchan', 'lidl', 'aldi', 'monoprix', 'franprix', 'super u', 'casino', 'picard', 'biocoop'], direction: 'debit' },
  { id: 'transport', category: 'transport', keywords: ['sncf', 'ratp', 'navigo', 'blablacar', 'uber trip', 'bolt', 'total energies', 'esso', 'shell', 'peage', 'tcl ', 'lia '], direction: 'debit' },
  { id: 'subscriptions', category: 'subscriptions', keywords: ['netflix', 'spotify', 'deezer', 'disney', 'canal+', 'amazon prime', 'youtube premium', 'apple.com/bill', 'free mobile', 'sfr', 'bouygues', 'orange', 'basic fit', 'icloud'], direction: 'debit' },
  { id: 'housing', category: 'housing', keywords: ['loyer', 'edf', 'engie', 'veolia', 'assurance habitation', 'crous', 'syndic'], direction: 'debit' },
  { id: 'health', category: 'health', keywords: ['pharmacie', 'docteur', 'medecin', 'doctolib', 'mutuelle', 'dentiste', 'opticien'], direction: 'debit' },
  { id: 'shopping', category: 'shopping', keywords: ['amazon', 'fnac', 'decathlon', 'zara', 'h&m', 'ikea', 'vinted', 'shein', 'cdiscount', 'action '], direction: 'debit' },
  { id: 'leisure', category: 'leisure', keywords: ['cinema', 'ugc', 'pathe', 'steam', 'playstation', 'nintendo', 'concert', 'ticketmaster', 'fnac spectacles', 'bowling'], direction: 'debit' },
  { id: 'salary', category: 'income', keywords: ['salaire', 'paie', 'caf ', 'bourse', 'pole emploi', 'france travail'], direction: 'credit' },
];

const REFUND_WORDS = ['rembours', 'refund', 'avoir ', 'retour article', 'annulation'];

/**
 * Correspondance entre les catégories du prestataire et les nôtres.
 * À remplir à partir de GET /v3/aggregation/categories (Bridge) une fois l'accès obtenu :
 * aucun identifiant n'est inventé ici.
 */
export type ProviderCategoryMap = Record<string, CategoryId>;

export function normalizeLabel(label: string): string {
  return ` ${label}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .concat(' ');
}

export function matchRule(tx: Pick<Transaction, 'label' | 'amountMinor'>, rules: KeywordRule[]): KeywordRule | undefined {
  const label = normalizeLabel(tx.label);
  const direction = tx.amountMinor < 0 ? 'debit' : 'credit';
  return rules.find((r) => (!r.direction || r.direction === direction) && r.keywords.some((k) => label.includes(k)));
}

export function looksLikeRefund(tx: Pick<Transaction, 'label' | 'amountMinor'>): boolean {
  if (tx.amountMinor <= 0) return false;
  const label = normalizeLabel(tx.label);
  return REFUND_WORDS.some((w) => label.includes(w));
}

export interface TransferLink {
  kind: 'internal_transfer' | 'savings_transfer';
  counterpartId: string;
}

/**
 * Détecte les paires débit / crédit de même montant entre deux comptes de l'utilisateur
 * (à 3 jours d'écart au plus). Le versement vers un compte d'épargne devient « savings_transfer »
 * sur ses deux jambes : il n'est ni une dépense ni un revenu, et ne sera compté qu'une fois.
 */
export function detectInternalTransfers(txs: Transaction[], accounts: BankAccountRef[]): Map<string, TransferLink> {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const links = new Map<string, TransferLink>();
  const candidates = txs.filter((t) => !t.removed && t.accountId && accountById.has(t.accountId));
  const debits = candidates.filter((t) => t.amountMinor < 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const credits = candidates.filter((t) => t.amountMinor > 0);
  for (const debit of debits) {
    const match = credits
      .filter(
        (c) =>
          !links.has(c.id) &&
          c.accountId !== debit.accountId &&
          c.currency === debit.currency &&
          c.amountMinor === -debit.amountMinor &&
          Math.abs(diffDays(c.date, debit.date)) <= 3,
      )
      .sort((a, b) => Math.abs(diffDays(a.date, debit.date)) - Math.abs(diffDays(b.date, debit.date)) || a.id.localeCompare(b.id))[0];
    if (!match) continue;
    const dest = accountById.get(match.accountId!);
    const kind = dest?.type === 'savings' || dest?.type === 'investment' ? 'savings_transfer' : 'internal_transfer';
    links.set(debit.id, { kind, counterpartId: match.id });
    links.set(match.id, { kind, counterpartId: debit.id });
  }
  return links;
}

export interface ClassifyContext {
  rules?: KeywordRule[];
  providerMap?: ProviderCategoryMap;
  overrides?: Map<string, CategoryOverride>;
  transfers?: Map<string, TransferLink>;
}

export function classify(tx: Transaction, ctx: ClassifyContext = {}): Classified {
  const override = ctx.overrides?.get(tx.id);
  const base = classifyWithoutOverride(tx, ctx);
  if (!override) return base;
  const kind = override.kind ?? (override.category ? kindForCategory(override.category, tx, base.kind) : base.kind);
  return { category: override.category ?? base.category, kind, source: 'user' };
}

function kindForCategory(category: CategoryId, tx: Transaction, fallback: TransactionKind): TransactionKind {
  if (category === 'income') return 'income';
  if (category === 'savings_transfers') return fallback === 'internal_transfer' ? 'internal_transfer' : 'savings_transfer';
  // Un crédit rangé dans une catégorie de dépense est un remboursement, pas un revenu.
  return tx.amountMinor < 0 ? 'expense' : 'refund';
}

function classifyWithoutOverride(tx: Transaction, ctx: ClassifyContext): Classified {
  const transfer = ctx.transfers?.get(tx.id);
  if (transfer) return { category: 'savings_transfers', kind: transfer.kind, source: 'transfer_detection' };

  const isCredit = tx.amountMinor > 0;
  const refund = isCredit && looksLikeRefund(tx);
  const rule = matchRule(tx, ctx.rules ?? DEFAULT_RULES);
  const provider = tx.providerCategory ? ctx.providerMap?.[tx.providerCategory] : undefined;

  if (provider) {
    if (provider === 'income' && refund) return { category: 'other', kind: 'refund', source: 'provider' };
    const kind: TransactionKind = provider === 'income' ? 'income' : provider === 'savings_transfers' ? 'savings_transfer' : isCredit ? 'refund' : 'expense';
    return { category: provider, kind, source: 'provider' };
  }
  if (refund) {
    // Un remboursement garde la catégorie de la dépense d'origine quand on la reconnaît.
    const refundRule = matchRule({ label: tx.label, amountMinor: -tx.amountMinor }, ctx.rules ?? DEFAULT_RULES);
    return { category: refundRule?.category ?? 'other', kind: 'refund', source: refundRule ? 'rule' : 'default', ruleId: refundRule?.id };
  }
  if (rule) return { category: rule.category, kind: isCredit ? 'income' : 'expense', source: 'rule', ruleId: rule.id };
  return isCredit ? { category: 'income', kind: 'income', source: 'default' } : { category: 'other', kind: 'expense', source: 'default' };
}
