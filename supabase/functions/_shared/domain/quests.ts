import { spentInCategory, summarizeSpending, type ClassifiedTransaction } from './aggregation.ts';
import { budgetStatus, type Budget } from './budgets.ts';
import { addDays, diffDays, type DateStr, type Period } from './dates.ts';
import type { HabitCompletion } from './habits.ts';
import type { GoalProgress, SavingsEntry } from './savings.ts';
import type { CategoryId } from './transactions.ts';

export type QuestCategory = 'analyse' | 'epargne' | 'reduction' | 'budget' | 'habitude';
export type QuestDifficulty = 'facile' | 'moyen' | 'difficile';

export type QuestRule =
  /** Étapes cochées par l'utilisateur : validation déclarative explicite. */
  | { type: 'manual_checklist'; steps: string[] }
  /** Compteur déclaré (ex. repas préparés à la maison). */
  | { type: 'manual_count'; target: number; unit: string }
  /** Mises de côté enregistrées pendant la quête. */
  | { type: 'savings_during'; targetMinor: number }
  /** Total suivi dans le coffre (toutes périodes). */
  | { type: 'vault_total'; targetMinor: number }
  /** Baisse des dépenses d'une catégorie par rapport à la période précédente de même durée (données bancaires). */
  | { type: 'category_reduction'; category: CategoryId; reductionPct: number }
  /** Budget de la catégorie respecté sur toute la durée de la quête. */
  | { type: 'budget_respected'; category: CategoryId }
  /** Jours distincts où l'habitude « vérifier son budget » a été faite. */
  | { type: 'review_days'; target: number; habitId: string }
  | { type: 'weekly_review' }
  | { type: 'goal_reached' };

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  durationDays: number;
  xp: number;
  rule: QuestRule;
  /** L'utilisateur peut déclarer la quête réussie si les données ne permettent pas de la vérifier. */
  manualFallback: boolean;
}

export type UserQuestStatus = 'active' | 'completed' | 'expired' | 'abandoned';

export interface UserQuest {
  id: string;
  questId: string;
  startDate: DateStr;
  endDate: DateStr;
  status: UserQuestStatus;
  checkedSteps: number[];
  manualCount: number;
  /** Comment la réussite a été établie. */
  evidence?: QuestEvidence | null;
  completedAt?: string | null;
}

export type QuestEvidence = 'bank_data' | 'app_activity' | 'declared' | 'demo_data';

export type DataMode = 'bank' | 'manual' | 'demo' | 'none';

/** Fiabilité des données disponibles pour vérifier une quête basée sur les transactions. */
export interface DataQuality {
  mode: DataMode;
  /** Première date couverte par les données importées. */
  coverageFrom: DateStr | null;
  /** Dernière synchronisation réussie (ISO). */
  lastSyncAt: string | null;
  /** Connexion sans erreur ni consentement expiré. */
  healthy: boolean;
  /** Part des dépenses non catégorisées (« Autres » par défaut), entre 0 et 1. */
  uncategorizedShare: number;
}

export interface QuestContext {
  today: DateStr;
  transactions: ClassifiedTransaction[];
  currency: string;
  entries: SavingsEntry[];
  goals: GoalProgress[];
  budgets: Budget[];
  habitCompletions: HabitCompletion[];
  weeklyReviews: DateStr[];
  data: DataQuality;
}

export type QuestState =
  | 'in_progress'
  /** Conditions remplies : la quête peut être validée. */
  | 'ready'
  /** Données insuffisantes ou peu fiables : pas de validation automatique. */
  | 'insufficient_data'
  | 'failed'
  | 'completed'
  | 'expired'
  | 'abandoned';

export interface QuestEvaluation {
  state: QuestState;
  progress: number;
  detail: string;
  evidence: QuestEvidence | null;
  canDeclareManually: boolean;
}

const MAX_UNCATEGORIZED = 0.25;

/**
 * Les données bancaires sont-elles assez fiables pour juger la fenêtre [from, to] ?
 * Il faut une connexion saine, synchronisée après la fin de la fenêtre, couvrant toute la fenêtre,
 * et une catégorisation suffisante.
 */
export function bankDataReliable(data: DataQuality, window: Period): { ok: boolean; reason?: string } {
  if (data.mode !== 'bank' && data.mode !== 'demo') return { ok: false, reason: 'Aucune banque connectée pour vérifier automatiquement.' };
  if (!data.healthy) return { ok: false, reason: 'La connexion bancaire demande une action : vérification impossible.' };
  if (!data.lastSyncAt || data.lastSyncAt.slice(0, 10) < window.to) return { ok: false, reason: 'Données pas encore synchronisées jusqu’à la fin de la période.' };
  if (!data.coverageFrom || data.coverageFrom > window.from) return { ok: false, reason: 'L’historique importé ne couvre pas la période de comparaison.' };
  if (data.uncategorizedShare > MAX_UNCATEGORIZED) return { ok: false, reason: 'Trop d’opérations non catégorisées : corrige-les pour une vérification fiable.' };
  return { ok: true };
}

function sumSavings(entries: SavingsEntry[], from: DateStr, to: DateStr, currency: string): number {
  return entries.filter((e) => e.currency === currency && e.date >= from && e.date <= to).reduce((s, e) => s + e.amountMinor, 0);
}

export function questWindow(uq: Pick<UserQuest, 'startDate' | 'endDate'>): Period {
  return { from: uq.startDate, to: uq.endDate };
}

export function startQuest(def: QuestDef, id: string, today: DateStr): UserQuest {
  return { id, questId: def.id, startDate: today, endDate: addDays(today, def.durationDays - 1), status: 'active', checkedSteps: [], manualCount: 0 };
}

export function evaluateQuest(def: QuestDef, uq: UserQuest, ctx: QuestContext): QuestEvaluation {
  if (uq.status === 'completed') return { state: 'completed', progress: 1, detail: 'Quête terminée.', evidence: uq.evidence ?? null, canDeclareManually: false };
  if (uq.status === 'abandoned') return { state: 'abandoned', progress: 0, detail: 'Quête abandonnée.', evidence: null, canDeclareManually: false };
  const window = questWindow(uq);
  const over = ctx.today > window.to;
  const evidenceFromData: QuestEvidence = ctx.data.mode === 'demo' ? 'demo_data' : 'bank_data';
  const r = def.rule;
  const base = (state: QuestState, progress: number, detail: string, evidence: QuestEvidence | null): QuestEvaluation => ({
    state: over && state === 'in_progress' ? 'expired' : state,
    progress: Math.max(0, Math.min(1, progress)),
    detail,
    evidence,
    canDeclareManually: def.manualFallback && (state === 'insufficient_data' || state === 'in_progress'),
  });

  switch (r.type) {
    case 'manual_checklist': {
      const n = new Set(uq.checkedSteps.filter((i) => i >= 0 && i < r.steps.length)).size;
      return base(n === r.steps.length ? 'ready' : 'in_progress', n / r.steps.length, `${n}/${r.steps.length} étapes`, 'declared');
    }
    case 'manual_count': {
      const n = Math.min(uq.manualCount, r.target);
      return base(n >= r.target ? 'ready' : 'in_progress', n / r.target, `${n}/${r.target} ${r.unit}`, 'declared');
    }
    case 'savings_during': {
      const saved = sumSavings(ctx.entries, window.from, window.to, ctx.currency);
      return base(saved >= r.targetMinor ? 'ready' : 'in_progress', saved / r.targetMinor, 'Mises de côté enregistrées pendant la quête', 'declared');
    }
    case 'vault_total': {
      const saved = sumSavings(ctx.entries, '0000-01-01', ctx.today, ctx.currency);
      return base(saved >= r.targetMinor ? 'ready' : 'in_progress', saved / r.targetMinor, 'Total suivi dans le coffre', 'declared');
    }
    case 'goal_reached': {
      const reached = ctx.goals.some((g) => g.reached && g.goal.createdAt.slice(0, 10) <= window.to);
      const best = Math.max(0, ...ctx.goals.map((g) => g.ratio));
      return base(reached ? 'ready' : 'in_progress', reached ? 1 : best, 'Progression de ton meilleur objectif', 'app_activity');
    }
    case 'weekly_review': {
      const done = ctx.weeklyReviews.some((d) => d >= window.from && d <= window.to);
      return base(done ? 'ready' : 'in_progress', done ? 1 : 0, done ? 'Bilan réalisé' : 'Bilan à faire', 'app_activity');
    }
    case 'review_days': {
      const days = new Set(ctx.habitCompletions.filter((c) => c.habitId === r.habitId && c.date >= window.from && c.date <= window.to).map((c) => c.date));
      return base(days.size >= r.target ? 'ready' : 'in_progress', days.size / r.target, `${days.size}/${r.target} jours d’analyse`, 'app_activity');
    }
    case 'category_reduction': {
      const len = diffDays(window.to, window.from) + 1;
      const baseline: Period = { from: addDays(window.from, -len), to: addDays(window.from, -1) };
      if (!over) {
        const elapsed = Math.min(len, diffDays(ctx.today, window.from) + 1);
        return base('in_progress', elapsed / len, 'Résultat calculé à la fin de la période, après synchronisation', null);
      }
      const reliable = bankDataReliable(ctx.data, { from: baseline.from, to: window.to });
      if (!reliable.ok) return { ...base('insufficient_data', 0, reliable.reason!, null), state: 'insufficient_data' };
      const cur = spentInCategory(summarizeSpending(ctx.transactions, window, ctx.currency), r.category);
      const prev = spentInCategory(summarizeSpending(ctx.transactions, baseline, ctx.currency), r.category);
      if (prev === 0) {
        return { ...base('insufficient_data', 0, 'Aucune dépense dans cette catégorie sur la période précédente : rien à comparer.', null), state: 'insufficient_data' };
      }
      const reduction = (prev - cur) / prev;
      const ok = reduction * 100 >= r.reductionPct;
      return {
        ...base(ok ? 'ready' : 'failed', ok ? 1 : Math.max(0, reduction) / (r.reductionPct / 100), `Baisse de ${Math.round(reduction * 100)} % (objectif ${r.reductionPct} %)`, evidenceFromData),
        state: ok ? 'ready' : 'failed',
      };
    }
    case 'budget_respected': {
      const budget = ctx.budgets.find((b) => b.category === r.category && b.currency === ctx.currency);
      if (!budget) return base('insufficient_data', 0, 'Définis d’abord un budget pour cette catégorie.', null);
      const len = diffDays(window.to, window.from) + 1;
      const end = over ? window.to : ctx.today;
      const summary = summarizeSpending(ctx.transactions, { from: window.from, to: end }, ctx.currency);
      // Plafond proratisé sur la durée de la quête.
      const periodDays = budget.period === 'week' ? 7 : 30;
      const limit = Math.round((budget.limitMinor * len) / periodDays);
      const status = budgetStatus({ ...budget, limitMinor: limit }, summary);
      if (status.health === 'over') return { ...base('failed', 0, 'Budget dépassé sur la période', null), state: 'failed' };
      if (!over) return base('in_progress', (diffDays(ctx.today, window.from) + 1) / len, 'Budget respecté jusqu’ici', null);
      if (ctx.data.mode === 'manual') {
        return { ...base('insufficient_data', 1, 'Données saisies à la main : confirme que tout est bien enregistré.', null), state: 'insufficient_data' };
      }
      const reliable = bankDataReliable(ctx.data, window);
      if (!reliable.ok) return { ...base('insufficient_data', 0, reliable.reason!, null), state: 'insufficient_data' };
      return { ...base('ready', 1, 'Budget respecté sur toute la période', evidenceFromData), state: 'ready' };
    }
  }
}

// ——— Catalogue ———

export const REVIEW_HABIT_ID = 'habit-check-budget';

export const QUEST_CATALOG: QuestDef[] = [
  {
    id: 'q-save-10',
    title: 'Mettre 10 € de côté',
    description: 'Mets 10 € de côté cette semaine et enregistre-le dans ton coffre.',
    category: 'epargne',
    difficulty: 'facile',
    durationDays: 7,
    xp: 15,
    rule: { type: 'savings_during', targetMinor: 1000 },
    manualFallback: false,
  },
  {
    id: 'q-vault-100',
    title: 'Atteindre 100 € dans le coffre',
    description: 'Fais grimper le total suivi dans ton coffre jusqu’à 100 €, à ton rythme.',
    category: 'epargne',
    difficulty: 'moyen',
    durationDays: 60,
    xp: 40,
    rule: { type: 'vault_total', targetMinor: 10000 },
    manualFallback: false,
  },
  {
    id: 'q-analyse-7',
    title: 'Analyser ses dépenses 7 jours',
    description: 'Ouvre ton budget et fais le point chaque jour pendant une semaine.',
    category: 'analyse',
    difficulty: 'moyen',
    durationDays: 7,
    xp: 30,
    rule: { type: 'review_days', target: 7, habitId: REVIEW_HABIT_ID },
    manualFallback: false,
  },
  {
    id: 'q-delivery-down',
    title: 'Moins de livraisons',
    description: 'Réduis d’au moins 30 % tes dépenses « Restaurants et livraison » sur 7 jours par rapport aux 7 jours précédents.',
    category: 'reduction',
    difficulty: 'moyen',
    durationDays: 7,
    xp: 35,
    rule: { type: 'category_reduction', category: 'restaurants', reductionPct: 30 },
    manualFallback: true,
  },
  {
    id: 'q-leisure-budget',
    title: 'Tenir son budget loisirs',
    description: 'Reste sous ton budget loisirs pendant une semaine.',
    category: 'budget',
    difficulty: 'moyen',
    durationDays: 7,
    xp: 30,
    rule: { type: 'budget_respected', category: 'leisure' },
    manualFallback: true,
  },
  {
    id: 'q-subscriptions',
    title: 'Chasser un abonnement inutile',
    description: 'Passe en revue tes abonnements et repère celui que tu n’utilises plus.',
    category: 'analyse',
    difficulty: 'facile',
    durationDays: 7,
    xp: 20,
    rule: { type: 'manual_checklist', steps: ['Lister mes abonnements', 'Repérer celui que j’utilise le moins', 'Décider : garder, suspendre ou résilier'] },
    manualFallback: false,
  },
  {
    id: 'q-home-meals',
    title: 'Cuisiner à la maison',
    description: 'Prépare 3 repas à la maison au lieu de commander.',
    category: 'habitude',
    difficulty: 'facile',
    durationDays: 7,
    xp: 20,
    rule: { type: 'manual_count', target: 3, unit: 'repas' },
    manualFallback: false,
  },
  {
    id: 'q-impulse',
    title: 'Freiner les achats impulsifs',
    description: 'Avant chaque achat non prévu, attends 24 h. Note 3 fois où tu as résisté.',
    category: 'habitude',
    difficulty: 'moyen',
    durationDays: 14,
    xp: 30,
    rule: { type: 'manual_count', target: 3, unit: 'achats évités' },
    manualFallback: false,
  },
  {
    id: 'q-weekly-review',
    title: 'Bilan de la semaine',
    description: 'Fais ton bilan financier hebdomadaire en 2 minutes.',
    category: 'analyse',
    difficulty: 'facile',
    durationDays: 7,
    xp: 20,
    rule: { type: 'weekly_review' },
    manualFallback: false,
  },
  {
    id: 'q-goal',
    title: 'Atteindre un objectif',
    description: 'Mène l’un de tes objectifs d’épargne jusqu’au bout.',
    category: 'epargne',
    difficulty: 'difficile',
    durationDays: 90,
    xp: 60,
    rule: { type: 'goal_reached' },
    manualFallback: false,
  },
];

export function questById(id: string): QuestDef | undefined {
  return QUEST_CATALOG.find((q) => q.id === id);
}
