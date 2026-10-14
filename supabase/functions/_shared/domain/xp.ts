// Règles d'XP centralisées. Les récompenses dépendent du comportement (régularité,
// objectifs personnels), jamais du solde, du salaire ni du patrimoine.

export type XpReason =
  | 'first_bank_connection'
  | 'first_quest'
  | 'quest_completed'
  | 'weekly_review'
  | 'goal_reached'
  | 'habit_streak'
  | 'challenge_completed'
  | 'badge_unlocked';

export const XP_RULES = {
  first_bank_connection: 30,
  first_quest: 25,
  weekly_review: 20,
  goal_reached: 50,
  /** Bonus de série, accordé aux paliers ci-dessous uniquement. */
  habit_streak: { 3: 10, 7: 20, 14: 30, 30: 60 } as Record<number, number>,
  challenge_completed: 40,
} as const;

export const STREAK_MILESTONES = Object.keys(XP_RULES.habit_streak).map(Number);

export interface XpEvent {
  /** Clé d'idempotence : un même événement ne rapporte qu'une fois. */
  key: string;
  reason: XpReason;
  amount: number;
  at: string;
  label: string;
}

/** Clés d'idempotence normalisées, identiques côté appli et côté serveur. */
export const xpKeys = {
  firstBankConnection: () => 'first_bank_connection',
  firstQuest: () => 'first_quest',
  quest: (questId: string, periodKey: string) => `quest:${questId}:${periodKey}`,
  weeklyReview: (isoWeek: string) => `weekly_review:${isoWeek}`,
  goalReached: (goalId: string) => `goal_reached:${goalId}`,
  habitStreak: (habitId: string, milestone: number, streakStart: string) => `habit_streak:${habitId}:${milestone}:${streakStart}`,
  challenge: (challengeId: string) => `challenge:${challengeId}`,
};

/** Ajoute un événement s'il n'a jamais été accordé ; renvoie le registre inchangé sinon. */
export function awardXp(ledger: XpEvent[], event: XpEvent): { ledger: XpEvent[]; awarded: boolean } {
  if (!Number.isInteger(event.amount) || event.amount <= 0 || event.amount > 500) {
    throw new Error('Montant d’XP invalide');
  }
  if (ledger.some((e) => e.key === event.key)) return { ledger, awarded: false };
  return { ledger: [...ledger, event], awarded: true };
}

export function totalXp(ledger: XpEvent[]): number {
  return ledger.reduce((s, e) => s + e.amount, 0);
}

/** XP cumulée nécessaire pour atteindre un niveau : 0, 100, 250, 450, 700, 1000… */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 25 * (level - 1) * (level + 2);
}

export interface LevelInfo {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  /** Progression vers le niveau suivant, entre 0 et 1. */
  progress: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, levelStartXp: start, nextLevelXp: next, progress: (xp - start) / (next - start) };
}

export const LEVEL_TITLES = ['Apprenti', 'Gardien', 'Stratège', 'Bâtisseur', 'Maître du coffre', 'Légende'];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 3))];
}
