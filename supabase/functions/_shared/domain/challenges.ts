// Défis entre amis : seuls des scores explicitement partagés circulent.
// Aucun solde, aucune transaction, aucun montant n'entre dans un classement.

export type ChallengeType = 'quests_count' | 'habit_regularity' | 'weekly_review' | 'goal_progress' | 'collective_habits';

export const CHALLENGE_TYPES: Record<ChallengeType, { title: string; unit: string; collective: boolean }> = {
  quests_count: { title: 'Course aux quêtes', unit: 'quêtes', collective: false },
  habit_regularity: { title: 'Régularité', unit: 'jours tenus', collective: false },
  weekly_review: { title: 'Bilans de la semaine', unit: 'bilans', collective: false },
  goal_progress: { title: 'Vers mon objectif', unit: '% de mon objectif', collective: false },
  collective_habits: { title: 'Défi collectif', unit: 'habitudes', collective: true },
};

export interface Challenge {
  id: string;
  type: ChallengeType;
  title: string;
  startDate: string;
  endDate: string;
  /** Cible collective (somme des scores) pour les défis collectifs. */
  collectiveTarget?: number | null;
  visibility: 'private';
}

export interface ChallengeParticipant {
  userId: string;
  pseudo: string;
  avatar: string;
  /** Score partagé : un compte d'actions, ou un pourcentage d'objectif personnel. Jamais un montant. */
  sharedScore: number;
  left: boolean;
}

/** Garde-fou : un score partagé est un entier borné, jamais un montant. */
export function sanitizeSharedScore(type: ChallengeType, score: number): number {
  if (!Number.isFinite(score) || score < 0) return 0;
  const max = type === 'goal_progress' ? 100 : 1000;
  return Math.min(max, Math.floor(score));
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  pseudo: string;
  avatar: string;
  score: number;
}

export function leaderboard(participants: ChallengeParticipant[]): LeaderboardRow[] {
  const active = participants.filter((p) => !p.left).sort((a, b) => b.sharedScore - a.sharedScore || a.pseudo.localeCompare(b.pseudo));
  let rank = 0;
  let prev = Number.NaN;
  return active.map((p, i) => {
    if (p.sharedScore !== prev) rank = i + 1;
    prev = p.sharedScore;
    return { rank, userId: p.userId, pseudo: p.pseudo, avatar: p.avatar, score: p.sharedScore };
  });
}

export function collectiveProgress(challenge: Challenge, participants: ChallengeParticipant[]): number {
  if (!challenge.collectiveTarget) return 0;
  const sum = participants.filter((p) => !p.left).reduce((s, p) => s + p.sharedScore, 0);
  return Math.min(1, sum / challenge.collectiveTarget);
}

export function validatePseudo(pseudo: string): string | null {
  const p = pseudo.trim();
  if (p.length < 3 || p.length > 20) return 'Pseudo de 3 à 20 caractères.';
  if (!/^[\p{L}\p{N}_.-]+$/u.test(p)) return 'Lettres, chiffres, « _ », « . » et « - » uniquement.';
  return null;
}
