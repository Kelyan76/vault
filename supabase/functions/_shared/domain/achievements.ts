import type { DateStr } from './dates.ts';

// Les badges récompensent des habitudes, jamais un niveau de richesse.

export type AchievementId = 'first_quest' | 'first_week' | 'first_goal' | 'first_streak' | 'first_challenge' | 'first_month' | 'first_avoided';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  color: 'violet' | 'turquoise' | 'gold' | 'coral' | 'green';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_quest', title: 'Première quête', description: 'Terminer une première quête.', color: 'coral' },
  { id: 'first_week', title: 'Première semaine', description: 'Utiliser VAULT 7 jours différents.', color: 'turquoise' },
  { id: 'first_goal', title: 'Objectif atteint', description: 'Mener un objectif d’épargne au bout.', color: 'green' },
  { id: 'first_streak', title: 'Première série', description: 'Tenir une habitude 3 fois d’affilée.', color: 'violet' },
  { id: 'first_challenge', title: 'Esprit d’équipe', description: 'Terminer un premier défi entre amis.', color: 'gold' },
  { id: 'first_month', title: 'Premier mois', description: 'Faire 4 bilans hebdomadaires.', color: 'violet' },
  { id: 'first_avoided', title: 'Bien vu', description: 'Déclarer une première dépense évitée.', color: 'coral' },
];

export interface AchievementFacts {
  completedQuests: number;
  activeDays: DateStr[];
  goalsReached: number;
  bestStreak: number;
  completedChallenges: number;
  weeklyReviews: number;
  avoidedExpenses: number;
}

export function earnedAchievements(f: AchievementFacts): AchievementId[] {
  const out: AchievementId[] = [];
  if (f.completedQuests >= 1) out.push('first_quest');
  if (new Set(f.activeDays).size >= 7) out.push('first_week');
  if (f.goalsReached >= 1) out.push('first_goal');
  if (f.bestStreak >= 3) out.push('first_streak');
  if (f.completedChallenges >= 1) out.push('first_challenge');
  if (f.weeklyReviews >= 4) out.push('first_month');
  if (f.avoidedExpenses >= 1) out.push('first_avoided');
  return out;
}
