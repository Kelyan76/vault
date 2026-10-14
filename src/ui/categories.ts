import { CATEGORY_LABELS, type CategoryId, type TransactionKind } from '@shared/domain/transactions.ts';
import { categoryColors } from '@/theme/tokens';
import type { IconName } from './Icon';

export const CATEGORY_ICONS: Record<CategoryId, IconName> = {
  groceries: 'cart',
  restaurants: 'heart',
  transport: 'bike',
  housing: 'home',
  subscriptions: 'sync',
  shopping: 'gift',
  leisure: 'star',
  health: 'shield',
  income: 'arrowDown',
  savings_transfers: 'vault',
  other: 'dot',
};

export function categoryMeta(c: CategoryId) {
  const color = categoryColors[c];
  return { label: CATEGORY_LABELS[c], icon: CATEGORY_ICONS[c], color, bg: `${color}26` };
}

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Dépense',
  income: 'Revenu',
  refund: 'Remboursement',
  internal_transfer: 'Transfert entre mes comptes',
  savings_transfer: 'Versement vers mon épargne',
};

export const SOURCE_LABELS = {
  user: 'Ta correction',
  transfer_detection: 'Détecté : transfert entre tes comptes',
  provider: 'Catégorie fournie par la banque',
  rule: 'Règle automatique (mot-clé)',
  default: 'Par défaut, à vérifier',
} as const;
