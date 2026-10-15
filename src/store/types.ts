import type { ConnectionStatus, ProviderAccount } from '../../supabase/functions/_shared/banking/types.ts';
import type { StoredBankTransaction } from '../../supabase/functions/_shared/banking/sync.ts';
import type { Budget } from '../../supabase/functions/_shared/domain/budgets.ts';
import type { Challenge, ChallengeParticipant } from '../../supabase/functions/_shared/domain/challenges.ts';
import type { DateStr } from '../../supabase/functions/_shared/domain/dates.ts';
import type { Habit, HabitCompletion, HabitPause } from '../../supabase/functions/_shared/domain/habits.ts';
import type { UserQuest } from '../../supabase/functions/_shared/domain/quests.ts';
import type { AvoidedExpense, SavingsEntry, SavingsGoal } from '../../supabase/functions/_shared/domain/savings.ts';
import type { CategoryOverride, Transaction } from '../../supabase/functions/_shared/domain/transactions.ts';
import type { XpEvent } from '../../supabase/functions/_shared/domain/xp.ts';
import type { AchievementId } from '../../supabase/functions/_shared/domain/achievements.ts';
import type { FuelInput, GroceryInput } from '../../supabase/functions/_shared/domain/forecast.ts';

/** Deux espaces qui ne se mélangent jamais : la démo (données fictives) et mes données. */
export type Space = 'demo' | 'personal';

export type Avatar = 'fox' | 'owl' | 'cat' | 'bear' | 'panda' | 'frog' | 'koala' | 'tiger';

export interface Profile {
  pseudo: string;
  avatar: Avatar;
  currency: string;
  shareInChallenges: boolean;
  notifications: { quests: boolean; sync: boolean; challenges: boolean; weeklyReview: boolean };
}

export interface LocalBankConnection {
  id: string;
  provider: 'demo';
  institutionName: string;
  status: ConnectionStatus;
  lastSuccessfulSyncAt: string | null;
  consentExpiresAt: string | null;
  firstTransactionDate: DateStr | null;
  disconnectedAt: string | null;
  createdAt: string;
}

export interface LocalSyncJob {
  id: string;
  connectionId: string;
  trigger: 'initial' | 'manual';
  status: 'succeeded' | 'failed';
  inserted: number;
  updated: number;
  removed: number;
  at: string;
}

export interface Friend {
  id: string;
  pseudo: string;
  avatar: Avatar;
  status: 'pending_out' | 'pending_in' | 'accepted';
  /** Ami fictif du mode démo. */
  demo: boolean;
}

export interface LocalChallenge extends Challenge {
  participants: ChallengeParticipant[];
  createdBy: string;
}

export interface UserData {
  version: 1;
  createdAt: string;
  profile: Profile;
  bank: {
    connections: LocalBankConnection[];
    accounts: (ProviderAccount & { id: string; connectionId: string; syncedAt: string | null })[];
    transactions: StoredBankTransaction[];
    syncJobs: LocalSyncJob[];
  };
  manualTransactions: Transaction[];
  overrides: CategoryOverride[];
  budgets: Budget[];
  goals: SavingsGoal[];
  entries: SavingsEntry[];
  /** Historique des corrections du coffre (montants avant/après), pour la transparence. */
  entryHistory: { entryId: string; action: 'created' | 'updated' | 'deleted'; amountMinor: number; at: string }[];
  avoided: AvoidedExpense[];
  habits: Habit[];
  habitCompletions: HabitCompletion[];
  habitPauses: HabitPause[];
  userQuests: UserQuest[];
  xpLedger: XpEvent[];
  achievements: { id: AchievementId; at: string }[];
  weeklyReviews: { date: DateStr; mood: 'serein' | 'ok' | 'tendu' | null }[];
  activeDays: DateStr[];
  friends: Friend[];
  challenges: LocalChallenge[];
  reports: { friendId: string; reason: string; at: string }[];
  /** Réglages de l'outil de prévision (absents tant que l'utilisateur ne l'a pas ouvert). */
  forecast?: { grocery: GroceryInput; fuel: FuelInput; updatedAt: string };
}

export interface Meta {
  onboarded: boolean;
  space: Space;
  tutorialSeen: boolean;
}

/** Ce qu'une action peut déclencher à l'écran : XP gagnée, badge, niveau, célébration. */
export interface ActionEffects {
  xp: { amount: number; label: string }[];
  badges: AchievementId[];
  levelUp: number | null;
  message?: string;
}
