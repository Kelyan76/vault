import type { QuestCategory, QuestDifficulty, QuestEvidence, QuestState } from '@shared/domain/quests.ts';
import { colors } from '@/theme/tokens';
import type { IconName } from '@/ui/Icon';

export const QUEST_CATEGORY: Record<QuestCategory, { label: string; icon: IconName }> = {
  analyse: { label: 'Analyse', icon: 'search' },
  epargne: { label: 'Épargne', icon: 'coin' },
  reduction: { label: 'Réduction', icon: 'arrowDown' },
  budget: { label: 'Budget', icon: 'budget' },
  habitude: { label: 'Habitude', icon: 'leaf' },
};

export const DIFFICULTY: Record<QuestDifficulty, { label: string; dots: number }> = {
  facile: { label: 'Facile', dots: 1 },
  moyen: { label: 'Moyen', dots: 2 },
  difficile: { label: 'Difficile', dots: 3 },
};

export const STATE_LABEL: Record<QuestState, { label: string; color: string; bg: string }> = {
  in_progress: { label: 'EN COURS', color: colors.quest, bg: colors.questSoft },
  ready: { label: 'À VALIDER', color: colors.success, bg: colors.successSoft },
  insufficient_data: { label: 'À VÉRIFIER', color: colors.rewardInk, bg: colors.rewardSoft },
  failed: { label: 'NON ATTEINTE', color: colors.textMuted, bg: colors.surfaceAlt },
  completed: { label: 'TERMINÉE', color: colors.success, bg: colors.successSoft },
  expired: { label: 'TERMINÉE SANS RÉSULTAT', color: colors.textMuted, bg: colors.surfaceAlt },
  abandoned: { label: 'ABANDONNÉE', color: colors.textMuted, bg: colors.surfaceAlt },
};

export const EVIDENCE_LABEL: Record<QuestEvidence, string> = {
  bank_data: 'Vérifiée avec tes données bancaires',
  demo_data: 'Vérifiée avec les données fictives de la démo',
  app_activity: 'Vérifiée avec ton activité dans VAULT',
  declared: 'Déclarée par toi',
};
