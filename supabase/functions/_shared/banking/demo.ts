import { addDays, type DateStr } from '../domain/dates.ts';
import type { ProviderAccount, ProviderTransaction } from './types.ts';

// Banque FICTIVE pour le mode démonstration. Aucune donnée réelle, aucun appel réseau.
// Les montants sont générés de façon déterministe à partir d'une graine et de la date du jour.

export const DEMO_INSTITUTION = 'Banque Démo (fictive)';
export const DEMO_CONNECTION_ID = 'demo-connection';

export const DEMO_ACCOUNTS: ProviderAccount[] = [
  {
    providerAccountId: 'demo-checking',
    providerConnectionId: DEMO_CONNECTION_ID,
    name: 'Compte courant démo',
    type: 'checking',
    balanceMinor: 84_250,
    currency: 'EUR',
    ibanLast4: '0042',
    dataAccess: true,
    providerUpdatedAt: null,
  },
  {
    providerAccountId: 'demo-savings',
    providerConnectionId: DEMO_CONNECTION_ID,
    name: 'Livret démo',
    type: 'savings',
    balanceMinor: 120_000,
    currency: 'EUR',
    ibanLast4: '0077',
    dataAccess: true,
    providerUpdatedAt: null,
  },
  {
    providerAccountId: 'demo-card-usd',
    providerConnectionId: DEMO_CONNECTION_ID,
    name: 'Carte voyage démo',
    type: 'card',
    balanceMinor: null, // solde indisponible : cas géré par l'interface
    currency: 'USD',
    ibanLast4: null,
    dataAccess: true,
    providerUpdatedAt: null,
  },
];

/** Pseudo-aléatoire déterministe à partir d'une chaîne (date + modèle) : identique d'une synchronisation à l'autre. */
function hashUnit(key: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function dayNumber(date: DateStr): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

interface Template {
  label: string;
  min: number;
  max: number;
  everyDays: number;
  offset: number;
  category: string;
}

const TEMPLATES: Template[] = [
  { label: 'CARREFOUR CITY', min: 1200, max: 4800, everyDays: 4, offset: 1, category: 'demo:groceries' },
  { label: 'LIDL', min: 1500, max: 5200, everyDays: 9, offset: 3, category: 'demo:groceries' },
  { label: 'UBER EATS', min: 1400, max: 3200, everyDays: 5, offset: 2, category: 'demo:restaurants' },
  { label: 'BOULANGERIE DU PORT', min: 250, max: 900, everyDays: 3, offset: 0, category: 'demo:restaurants' },
  { label: 'SNCF CONNECT', min: 1900, max: 6500, everyDays: 17, offset: 6, category: 'demo:transport' },
  { label: 'PATHE CINEMA', min: 1100, max: 2400, everyDays: 12, offset: 5, category: 'demo:leisure' },
  { label: 'PHARMACIE CENTRALE', min: 600, max: 2100, everyDays: 19, offset: 8, category: 'demo:health' },
  { label: 'VINTED', min: 800, max: 3500, everyDays: 15, offset: 4, category: 'demo:shopping' },
];

/**
 * Transactions de démonstration sur `days` jours jusqu'à `today` :
 * dépenses courantes, salaire, loyer, abonnements, un virement vers le livret (transfert interne),
 * un remboursement, une opération en attente et une dépense en dollars.
 */
export function demoTransactions(today: DateStr, days = 75, seed = 42): ProviderTransaction[] {
  const out: ProviderTransaction[] = [];
  const start = addDays(today, -(days - 1));
  const push = (date: DateStr, label: string, amountMinor: number, account = 'demo-checking', extra: Partial<ProviderTransaction> = {}) => {
    out.push({
      // Identifiant stable : date + libellé + compte (comme un vrai identifiant prestataire, il ne change pas).
      providerTransactionId: `demo-${date}-${account}-${label.replace(/[^A-Z0-9]+/gi, '-').toLowerCase()}`,
      providerAccountId: account,
      date,
      label,
      amountMinor,
      currency: account === 'demo-card-usd' ? 'USD' : 'EUR',
      providerCategory: null,
      operationType: amountMinor < 0 ? 'card' : 'transfer',
      status: 'booked',
      deleted: false,
      providerUpdatedAt: `${date}T12:00:00.000Z`,
      ...extra,
    });
  };
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dom = Number(date.slice(8, 10));
    const n = dayNumber(date);
    for (const t of TEMPLATES) {
      if ((n + t.offset) % t.everyDays === 0) {
        push(date, t.label, -Math.round(t.min + hashUnit(`${date}${t.label}`, seed) * (t.max - t.min)), 'demo-checking', { providerCategory: t.category });
      }
    }
    if (dom === 1) push(date, 'VIR SALAIRE DEMO SARL', 165_000, 'demo-checking', { operationType: 'transfer' });
    if (dom === 3) push(date, 'LOYER APPARTEMENT', -52_000, 'demo-checking', { operationType: 'direct_debit' });
    if (dom === 5) push(date, 'NETFLIX.COM', -1399, 'demo-checking', { operationType: 'direct_debit' });
    if (dom === 6) push(date, 'SPOTIFY', -1199, 'demo-checking', { operationType: 'direct_debit' });
    if (dom === 8) push(date, 'BASIC FIT', -2999, 'demo-checking', { operationType: 'direct_debit' });
    if (dom === 10) {
      // Virement vers le livret : deux jambes, un seul mouvement d'épargne.
      push(date, 'VIR VERS LIVRET DEMO', -10_000, 'demo-checking', { operationType: 'transfer' });
      push(date, 'VIR DEPUIS COMPTE COURANT', 10_000, 'demo-savings', { operationType: 'transfer' });
    }
    if (dom === 20) push(date, 'REMBOURSEMENT VINTED', 1250, 'demo-checking', { operationType: 'transfer' });
    if (dom === 14) push(date, 'COFFEE SHOP NYC', -650, 'demo-card-usd');
  }
  push(today, 'UBER EATS (en attente)', -2190, 'demo-checking', { status: 'pending', providerTransactionId: `demo-pending-${today}` });
  return out;
}

/** Catégories « prestataire » de la banque fictive, pour montrer la priorité donnée aux catégories fournies. */
export const DEMO_CATEGORY_MAP = {
  'demo:groceries': 'groceries',
  'demo:restaurants': 'restaurants',
  'demo:transport': 'transport',
  'demo:leisure': 'leisure',
  'demo:health': 'health',
  'demo:shopping': 'shopping',
} as const;
