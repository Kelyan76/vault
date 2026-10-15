// Actions de l'appli : fonctions pures (état, entrée) -> (nouvel état, effets à célébrer).
// Les règles viennent toutes du domaine partagé avec le serveur.
import { earnedAchievements } from '../../supabase/functions/_shared/domain/achievements.ts';
import { validateBudget } from '../../supabase/functions/_shared/domain/budgets.ts';
import { addDays, isoWeekKey, type DateStr } from '../../supabase/functions/_shared/domain/dates.ts';
import { computeStreak } from '../../supabase/functions/_shared/domain/habits.ts';
import { questById, startQuest, type QuestEvaluation } from '../../supabase/functions/_shared/domain/quests.ts';
import {
  estimatedSaving,
  goalProgress,
  validateAvoided,
  validateEntry,
  validateGoal,
  type Allocation,
  type GoalIcon,
  type SavingsEntry,
} from '../../supabase/functions/_shared/domain/savings.ts';
import { isCategoryId, type CategoryId, type TransactionKind } from '../../supabase/functions/_shared/domain/transactions.ts';
import { awardXp, levelInfo, STREAK_MILESTONES, totalXp, XP_RULES, xpKeys, type XpReason } from '../../supabase/functions/_shared/domain/xp.ts';
import { sanitizeSharedScore, validatePseudo, type ChallengeType } from '../../supabase/functions/_shared/domain/challenges.ts';
import { fuelForecast, groceryForecast, validateFuel, validateGrocery, type FuelInput, type GroceryInput } from '../../supabase/functions/_shared/domain/forecast.ts';
import type { FixedItem } from '../../supabase/functions/_shared/domain/projection.ts';
import { applyMerge, mergeTransactions } from '../../supabase/functions/_shared/banking/sync.ts';
import { DEMO_ACCOUNTS, DEMO_CONNECTION_ID, DEMO_INSTITUTION, demoTransactions } from '../../supabase/functions/_shared/banking/demo.ts';
import type { ActionEffects, Avatar, Friend, Profile, Space, UserData } from './types.ts';

export interface Env {
  now: string;
  today: DateStr;
  id: () => string;
  space: Space;
}

export type Result = { data: UserData; effects: ActionEffects; error?: string };

const noEffects = (): ActionEffects => ({ xp: [], badges: [], levelUp: null });

export class ActionError extends Error {}

function fail(message: string): never {
  throw new ActionError(message);
}

/** Ajoute de l'XP (idempotent) et note l'effet à célébrer. */
function grant(data: UserData, fx: ActionEffects, env: Env, key: string, reason: XpReason, amount: number, label: string): UserData {
  const r = awardXp(data.xpLedger, { key, reason, amount, at: env.now, label });
  if (!r.awarded) return data;
  fx.xp.push({ amount, label });
  return { ...data, xpLedger: r.ledger };
}

/** Badges et niveau recalculés après chaque action. */
function finalize(prev: UserData, data: UserData, fx: ActionEffects, env: Env): Result {
  const activeDays = data.activeDays.includes(env.today) ? data.activeDays : [...data.activeDays, env.today];
  let next = { ...data, activeDays };
  const streakBest = Math.max(0, ...next.habits.map((h) => computeStreak(h, next.habitCompletions, env.today, next.habitPauses).best));
  const facts = {
    completedQuests: next.userQuests.filter((q) => q.status === 'completed').length,
    activeDays: next.activeDays,
    goalsReached: next.goals.filter((g) => goalProgress(g, next.entries).reached).length,
    bestStreak: streakBest,
    completedChallenges: next.challenges.filter((c) => c.endDate < env.today && c.participants.some((p) => p.userId === 'me' && !p.left)).length,
    weeklyReviews: next.weeklyReviews.length,
    avoidedExpenses: next.avoided.length,
  };
  const have = new Set(next.achievements.map((a) => a.id));
  const fresh = earnedAchievements(facts).filter((id) => !have.has(id));
  if (fresh.length) {
    next = { ...next, achievements: [...next.achievements, ...fresh.map((id) => ({ id, at: env.now }))] };
    fx.badges.push(...fresh);
  }
  const before = levelInfo(totalXp(prev.xpLedger)).level;
  const after = levelInfo(totalXp(next.xpLedger)).level;
  if (after > before) fx.levelUp = after;
  return { data: next, effects: fx };
}

function run(data: UserData, env: Env, fn: (d: UserData, fx: ActionEffects) => UserData): Result {
  const fx = noEffects();
  try {
    return finalize(data, fn(data, fx), fx, env);
  } catch (e) {
    if (e instanceof ActionError) return { data, effects: noEffects(), error: e.message };
    throw e;
  }
}

// ——— Opérations ———

export function addManualTransaction(
  data: UserData,
  input: { label: string; amountMinor: number; direction: 'debit' | 'credit'; date: DateStr; category: CategoryId; currency?: string },
  env: Env,
): Result {
  return run(data, env, (d) => {
    const label = input.label.trim();
    if (label.length < 1 || label.length > 120) fail('Libellé requis (120 caractères max).');
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) fail('Montant invalide.');
    if (input.date > env.today) fail('La date ne peut pas être dans le futur.');
    if (!isCategoryId(input.category)) fail('Catégorie inconnue.');
    const id = `manual-${env.id()}`;
    const amountMinor = input.direction === 'debit' ? -input.amountMinor : input.amountMinor;
    const kind: TransactionKind =
      input.category === 'income' ? 'income' : input.category === 'savings_transfers' ? 'savings_transfer' : input.direction === 'debit' ? 'expense' : 'refund';
    return {
      ...d,
      manualTransactions: [
        ...d.manualTransactions,
        { id, source: 'manual', date: input.date, label, amountMinor, currency: input.currency ?? d.profile.currency, status: 'booked', createdAt: env.now },
      ],
      overrides: [...d.overrides, { transactionId: id, category: input.category, kind, updatedAt: env.now }],
    };
  });
}

export function deleteManualTransaction(data: UserData, id: string, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    manualTransactions: d.manualTransactions.filter((t) => t.id !== id),
    overrides: d.overrides.filter((o) => o.transactionId !== id),
  }));
}

/** Corrige la catégorie sans toucher au montant ni à la date ; null = revenir à la catégorie d'origine. */
export function setCategory(data: UserData, transactionId: string, category: CategoryId | null, env: Env): Result {
  return run(data, env, (d) => {
    const others = d.overrides.filter((o) => o.transactionId !== transactionId);
    if (!category) return { ...d, overrides: others };
    if (!isCategoryId(category)) fail('Catégorie inconnue.');
    return { ...d, overrides: [...others, { transactionId, category, updatedAt: env.now }] };
  });
}

// ——— Budgets ———

export function upsertBudget(data: UserData, input: { category: CategoryId; limitMinor: number; period: 'week' | 'month' }, env: Env): Result {
  return run(data, env, (d) => {
    const err = validateBudget(input);
    if (err) fail(err);
    const existing = d.budgets.find((b) => b.category === input.category && b.period === input.period);
    const budget = { id: existing?.id ?? env.id(), category: input.category, limitMinor: input.limitMinor, currency: d.profile.currency, period: input.period };
    return { ...d, budgets: [...d.budgets.filter((b) => b.id !== budget.id && b.category !== input.category), budget] };
  });
}

export function removeBudget(data: UserData, id: string, env: Env): Result {
  return run(data, env, (d) => ({ ...d, budgets: d.budgets.filter((b) => b.id !== id) }));
}

// ——— Objectifs et coffre ———

export function createGoal(data: UserData, input: { name: string; targetMinor: number; deadline?: DateStr | null; icon: GoalIcon }, env: Env): Result {
  return run(data, env, (d) => {
    const err = validateGoal(input);
    if (err) fail(err);
    if (input.deadline && input.deadline < env.today) fail('La date limite est déjà passée.');
    return {
      ...d,
      goals: [...d.goals, { id: env.id(), name: input.name.trim(), targetMinor: input.targetMinor, currency: d.profile.currency, deadline: input.deadline ?? null, icon: input.icon, createdAt: env.now }],
    };
  });
}

export function archiveGoal(data: UserData, goalId: string, env: Env): Result {
  return run(data, env, (d) => ({ ...d, goals: d.goals.map((g) => (g.id === goalId ? { ...g, archivedAt: env.now } : g)) }));
}

/** Récompense « objectif atteint » : une fois par objectif, pas pour un objectif jetable (< 10 € ou créé il y a moins de 24 h). */
function rewardReachedGoals(d: UserData, fx: ActionEffects, env: Env): UserData {
  let next = d;
  for (const g of d.goals) {
    const p = goalProgress(g, d.entries);
    const oldEnough = Date.parse(env.now) - Date.parse(g.createdAt) >= 24 * 3600_000;
    if (p.reached && g.targetMinor >= 1000 && oldEnough) {
      next = grant(next, fx, env, xpKeys.goalReached(g.id), 'goal_reached', XP_RULES.goal_reached, `Objectif atteint : ${g.name}`);
    }
  }
  return next;
}

export function addSavingsEntry(
  data: UserData,
  input: { amountMinor: number; allocations: Allocation[]; date: DateStr; note?: string; avoidedExpenseId?: string | null },
  env: Env,
): Result {
  return run(data, env, (d, fx) => {
    if (input.date > env.today) fail('La date ne peut pas être dans le futur.');
    const entry: SavingsEntry = {
      id: env.id(),
      kind: 'declared',
      amountMinor: input.amountMinor,
      currency: d.profile.currency,
      date: input.date,
      note: input.note?.trim() || undefined,
      allocations: input.allocations.filter((a) => a.amountMinor !== 0),
      avoidedExpenseId: input.avoidedExpenseId ?? null,
      createdAt: env.now,
      updatedAt: env.now,
    };
    const err = validateEntry(entry, d.goals);
    if (err) fail(err);
    let next: UserData = {
      ...d,
      entries: [...d.entries, entry],
      entryHistory: [...d.entryHistory, { entryId: entry.id, action: 'created', amountMinor: entry.amountMinor, at: env.now }],
      avoided: input.avoidedExpenseId ? d.avoided.map((a) => (a.id === input.avoidedExpenseId ? { ...a, setAsideEntryId: entry.id } : a)) : d.avoided,
    };
    next = rewardReachedGoals(next, fx, env);
    return next;
  });
}

/** Correction d'une écriture : nouveau montant (et répartition proportionnelle) ou suppression, historisée. */
export function correctSavingsEntry(data: UserData, entryId: string, newAmountMinor: number | null, env: Env): Result {
  return run(data, env, (d) => {
    const e = d.entries.find((x) => x.id === entryId) ?? fail('Écriture introuvable.');
    if (newAmountMinor === null) {
      return {
        ...d,
        entries: d.entries.filter((x) => x.id !== entryId),
        entryHistory: [...d.entryHistory, { entryId, action: 'deleted', amountMinor: e.amountMinor, at: env.now }],
        avoided: d.avoided.map((a) => (a.setAsideEntryId === entryId ? { ...a, setAsideEntryId: null } : a)),
      };
    }
    if (!Number.isInteger(newAmountMinor) || newAmountMinor === 0) fail('Montant invalide.');
    const ratio = newAmountMinor / e.amountMinor;
    let allocations = e.allocations.map((a) => ({ ...a, amountMinor: Math.trunc(a.amountMinor * ratio) }));
    if (ratio < 0) allocations = [];
    const updated = { ...e, amountMinor: newAmountMinor, allocations, updatedAt: env.now };
    const err = validateEntry(updated, d.goals);
    if (err) fail(err);
    return {
      ...d,
      entries: d.entries.map((x) => (x.id === entryId ? updated : x)),
      entryHistory: [...d.entryHistory, { entryId, action: 'updated', amountMinor: newAmountMinor, at: env.now }],
    };
  });
}

/** L'utilisateur confirme qu'un virement détecté vers son épargne alimente un objectif. */
export function confirmSavingsTransfer(
  data: UserData,
  tx: { id: string; amountMinor: number; removed?: boolean; currency: string; date: string; label: string },
  goalId: string | null,
  env: Env,
): Result {
  const transactionId = tx.id;
  return run(data, env, (d, fx) => {
    if (tx.amountMinor >= 0 || tx.removed) fail('Seul un virement sortant confirmé peut être ajouté.');
    if (d.entries.some((e) => e.sourceTransactionId === transactionId)) fail('Ce virement est déjà dans le coffre.');
    const amount = -tx.amountMinor;
    const entry: SavingsEntry = {
      id: env.id(),
      kind: 'observed_transfer',
      amountMinor: amount,
      currency: tx.currency,
      date: tx.date,
      note: tx.label,
      allocations: goalId ? [{ goalId, amountMinor: amount }] : [],
      sourceTransactionId: transactionId,
      createdAt: env.now,
      updatedAt: env.now,
    };
    const err = validateEntry(entry, d.goals);
    if (err) fail(err);
    const next = { ...d, entries: [...d.entries, entry], entryHistory: [...d.entryHistory, { entryId: entry.id, action: 'created' as const, amountMinor: amount, at: env.now }] };
    return rewardReachedGoals(next, fx, env);
  });
}

export function addAvoidedExpense(data: UserData, input: { label: string; plannedMinor: number; actualMinor: number; date: DateStr }, env: Env): Result {
  return run(data, env, (d) => {
    const err = validateAvoided(input);
    if (err) fail(err);
    if (input.date > env.today) fail('La date ne peut pas être dans le futur.');
    return {
      ...d,
      avoided: [...d.avoided, { id: env.id(), label: input.label.trim(), plannedMinor: input.plannedMinor, actualMinor: input.actualMinor, currency: d.profile.currency, date: input.date, setAsideEntryId: null, createdAt: env.now }],
    };
  });
}

/** Action distincte : déclarer qu'une partie de l'économie estimée a vraiment été mise de côté. */
export function setAsideFromAvoided(data: UserData, avoidedId: string, amountMinor: number, goalId: string | null, env: Env): Result {
  const a = data.avoided.find((x) => x.id === avoidedId);
  if (!a) return { data, effects: noEffects(), error: 'Dépense évitée introuvable.' };
  if (a.setAsideEntryId) return { data, effects: noEffects(), error: 'Déjà mise de côté.' };
  if (amountMinor <= 0 || amountMinor > estimatedSaving(a)) return { data, effects: noEffects(), error: 'Le montant dépasse l’économie estimée.' };
  return addSavingsEntry(data, { amountMinor, allocations: goalId ? [{ goalId, amountMinor }] : [], date: env.today, note: `Mis de côté : ${a.label}`, avoidedExpenseId: avoidedId }, env);
}

// ——— Habitudes ———

export function toggleHabit(data: UserData, habitId: string, date: DateStr, env: Env): Result {
  return run(data, env, (d, fx) => {
    const habit = d.habits.find((h) => h.id === habitId) ?? fail('Habitude introuvable.');
    if (date > env.today || date < addDays(env.today, -2)) fail('On peut valider aujourd’hui ou les deux jours précédents.');
    const done = d.habitCompletions.some((c) => c.habitId === habitId && c.date === date);
    if (done) return { ...d, habitCompletions: d.habitCompletions.filter((c) => !(c.habitId === habitId && c.date === date)) };
    let next = { ...d, habitCompletions: [...d.habitCompletions, { habitId, date }] };
    const s = computeStreak(habit, next.habitCompletions, env.today, next.habitPauses);
    for (const m of STREAK_MILESTONES) {
      if (s.current >= m && s.currentStart) {
        next = grant(next, fx, env, xpKeys.habitStreak(habitId, m, s.currentStart), 'habit_streak', XP_RULES.habit_streak[m], `Série de ${m} : ${habit.name}`);
      }
    }
    return next;
  });
}

export function addHabit(data: UserData, input: { name: string; frequency: 'daily' | 'weekly'; icon: 'eye' | 'list' | 'cart' | 'target' | 'coin' }, env: Env): Result {
  return run(data, env, (d) => {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 60) fail('Nom de 2 à 60 caractères.');
    if (d.habits.filter((h) => !h.archivedAt).length >= 12) fail('12 habitudes au maximum, pour rester simple.');
    return { ...d, habits: [...d.habits, { id: env.id(), name, frequency: input.frequency, icon: input.icon, createdAt: env.now }] };
  });
}

export function archiveHabit(data: UserData, habitId: string, env: Env): Result {
  return run(data, env, (d) => ({ ...d, habits: d.habits.map((h) => (h.id === habitId ? { ...h, archivedAt: env.now } : h)) }));
}

/** Pause : les jours en pause ne cassent aucune série. */
export function pauseHabits(data: UserData, days: number, env: Env): Result {
  return run(data, env, (d) => {
    if (days < 1 || days > 30) fail('Pause de 1 à 30 jours.');
    return { ...d, habitPauses: [...d.habitPauses, { from: env.today, to: addDays(env.today, days - 1) }] };
  });
}

export function endPause(data: UserData, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    habitPauses: d.habitPauses.map((p) => (p.from <= env.today && p.to >= env.today ? { ...p, to: addDays(env.today, -1) } : p)).filter((p) => p.to >= p.from),
  }));
}

// ——— Quêtes ———

export function beginQuest(data: UserData, questId: string, env: Env): Result {
  return run(data, env, (d) => {
    const def = questById(questId) ?? fail('Quête inconnue.');
    if (d.userQuests.some((q) => q.questId === questId && q.status === 'active')) fail('Cette quête est déjà en cours.');
    if (d.userQuests.filter((q) => q.status === 'active').length >= 5) fail('5 quêtes en même temps au maximum.');
    return { ...d, userQuests: [...d.userQuests, startQuest(def, env.id(), env.today)] };
  });
}

export function toggleQuestStep(data: UserData, userQuestId: string, step: number, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    userQuests: d.userQuests.map((q) => {
      if (q.id !== userQuestId || q.status !== 'active') return q;
      const has = q.checkedSteps.includes(step);
      return { ...q, checkedSteps: has ? q.checkedSteps.filter((s) => s !== step) : [...q.checkedSteps, step] };
    }),
  }));
}

export function bumpQuestCount(data: UserData, userQuestId: string, delta: 1 | -1, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    userQuests: d.userQuests.map((q) => (q.id === userQuestId && q.status === 'active' ? { ...q, manualCount: Math.max(0, Math.min(100, q.manualCount + delta)) } : q)),
  }));
}

export function abandonQuest(data: UserData, userQuestId: string, env: Env): Result {
  return run(data, env, (d) => ({ ...d, userQuests: d.userQuests.map((q) => (q.id === userQuestId && q.status === 'active' ? { ...q, status: 'abandoned' } : q)) }));
}

/**
 * Valide une quête à partir de son évaluation (calculée avec les mêmes règles que le serveur).
 * `declare` : validation manuelle explicite, seulement quand la quête l'autorise.
 */
export function completeQuest(data: UserData, userQuestId: string, evaluation: QuestEvaluation, declare: boolean, env: Env): Result {
  return run(data, env, (d, fx) => {
    const uq = d.userQuests.find((q) => q.id === userQuestId) ?? fail('Quête introuvable.');
    const def = questById(uq.questId) ?? fail('Quête inconnue.');
    if (uq.status !== 'active') fail('Cette quête n’est plus active.');
    const declared = declare && evaluation.canDeclareManually;
    if (evaluation.state !== 'ready' && !declared) fail('La quête n’est pas encore réussie.');
    const evidence = declared ? 'declared' : evaluation.evidence;
    let next: UserData = { ...d, userQuests: d.userQuests.map((q) => (q.id === userQuestId ? { ...q, status: 'completed', completedAt: env.now, evidence } : q)) };
    next = grant(next, fx, env, xpKeys.quest(def.id, uq.startDate), 'quest_completed', def.xp, def.title);
    next = grant(next, fx, env, xpKeys.firstQuest(), 'first_quest', XP_RULES.first_quest, 'Première quête terminée');
    return next;
  });
}

export function completeWeeklyReview(data: UserData, mood: 'serein' | 'ok' | 'tendu' | null, env: Env): Result {
  return run(data, env, (d, fx) => {
    const week = isoWeekKey(env.today);
    if (d.weeklyReviews.some((w) => isoWeekKey(w.date) === week)) fail('Bilan déjà fait cette semaine. Rendez-vous la semaine prochaine !');
    const next = { ...d, weeklyReviews: [...d.weeklyReviews, { date: env.today, mood }] };
    return grant(next, fx, env, xpKeys.weeklyReview(week), 'weekly_review', XP_RULES.weekly_review, 'Bilan hebdomadaire');
  });
}

// ——— Banque de démonstration (jamais présentée comme une vraie banque) ———

function demoSync(d: UserData, env: Env, trigger: 'initial' | 'manual'): UserData {
  const conn = d.bank.connections.find((c) => c.id === DEMO_CONNECTION_ID && !c.disconnectedAt);
  if (!conn) return d;
  const incoming = demoTransactions(env.today);
  // La fenêtre est relue entièrement : une opération en attente qui a disparu est marquée retirée.
  const window = { from: incoming.reduce((m, t) => (t.date < m ? t.date : m), env.today), to: env.today };
  const merge = mergeTransactions(d.bank.transactions, incoming, { now: env.now, makeId: (p) => `demo-tx-${p.providerTransactionId}`, fullWindow: window });
  const transactions = applyMerge(d.bank.transactions, merge);
  const accounts = DEMO_ACCOUNTS.map((a) => ({ ...a, id: `demo-acc-${a.providerAccountId}`, connectionId: conn.id, syncedAt: env.now, providerUpdatedAt: env.now }));
  const first = transactions.reduce((m, t) => (!m || t.date < m ? t.date : m), '' as string);
  return {
    ...d,
    bank: {
      connections: d.bank.connections.map((c) => (c.id === conn.id ? { ...c, status: 'connected', lastSuccessfulSyncAt: env.now, firstTransactionDate: first || null } : c)),
      accounts,
      transactions,
      syncJobs: [
        ...d.bank.syncJobs.slice(-19),
        { id: env.id(), connectionId: conn.id, trigger, status: 'succeeded', inserted: merge.inserts.length, updated: merge.updates.length, removed: merge.removals.length, at: env.now },
      ],
    },
  };
}

export function connectDemoBank(data: UserData, env: Env): Result {
  return run(data, env, (d) => {
    if (env.space !== 'demo') fail('La banque fictive n’est disponible qu’en mode démonstration.');
    const conn = {
      id: DEMO_CONNECTION_ID,
      provider: 'demo' as const,
      institutionName: DEMO_INSTITUTION,
      status: 'syncing' as const,
      lastSuccessfulSyncAt: null,
      consentExpiresAt: addDays(env.today, 180) + 'T00:00:00.000Z',
      firstTransactionDate: null,
      disconnectedAt: null,
      createdAt: env.now,
    };
    return demoSync({ ...d, bank: { ...d.bank, connections: [...d.bank.connections.filter((c) => c.id !== conn.id), conn] } }, env, 'initial');
  });
}

export function syncDemoBank(data: UserData, env: Env): Result {
  return run(data, env, (d) => demoSync(d, env, 'manual'));
}

export function disconnectDemoBank(data: UserData, deleteData: boolean, env: Env): Result {
  return run(data, env, (d) => {
    const ids = new Set(d.bank.transactions.map((t) => t.id));
    return {
      ...d,
      bank: {
        connections: d.bank.connections.map((c) => (c.id === DEMO_CONNECTION_ID ? { ...c, status: 'disconnected', disconnectedAt: env.now } : c)),
        accounts: deleteData ? [] : d.bank.accounts,
        transactions: deleteData ? [] : d.bank.transactions,
        syncJobs: d.bank.syncJobs,
      },
      overrides: deleteData ? d.overrides.filter((o) => !ids.has(o.transactionId)) : d.overrides,
      // Les mises de côté restent dans le coffre, détachées de l'opération supprimée.
      entries: deleteData ? d.entries.map((e) => (e.sourceTransactionId && ids.has(e.sourceTransactionId) ? { ...e, sourceTransactionId: null } : e)) : d.entries,
    };
  });
}

// ——— Profil, amis, défis ———

export function updateProfile(data: UserData, patch: Partial<Profile>, env: Env): Result {
  return run(data, env, (d) => {
    if (patch.pseudo !== undefined) {
      const err = validatePseudo(patch.pseudo);
      if (err) fail(err);
    }
    return { ...d, profile: { ...d.profile, ...patch, pseudo: patch.pseudo?.trim() ?? d.profile.pseudo } };
  });
}

export function inviteFriend(data: UserData, pseudo: string, env: Env): Result {
  return run(data, env, (d) => {
    const err = validatePseudo(pseudo);
    if (err) fail(err);
    if (pseudo.trim().toLowerCase() === d.profile.pseudo.toLowerCase()) fail('C’est ton propre pseudo.');
    if (d.friends.some((f) => f.pseudo.toLowerCase() === pseudo.trim().toLowerCase())) fail('Déjà dans ta liste.');
    const avatars: Avatar[] = ['owl', 'cat', 'bear', 'panda', 'frog', 'koala', 'tiger'];
    const friend: Friend = { id: env.id(), pseudo: pseudo.trim(), avatar: avatars[d.friends.length % avatars.length], status: 'pending_out', demo: env.space === 'demo' };
    return { ...d, friends: [...d.friends, friend] };
  });
}

export function acceptFriend(data: UserData, friendId: string, env: Env): Result {
  return run(data, env, (d) => ({ ...d, friends: d.friends.map((f) => (f.id === friendId && f.status === 'pending_in' ? { ...f, status: 'accepted' } : f)) }));
}

export function removeFriend(data: UserData, friendId: string, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    friends: d.friends.filter((f) => f.id !== friendId),
    challenges: d.challenges.map((c) => ({ ...c, participants: c.participants.filter((p) => p.userId !== friendId) })),
  }));
}

export function reportFriend(data: UserData, friendId: string, reason: string, env: Env): Result {
  return run(data, env, (d) => {
    if (reason.trim().length < 3) fail('Décris brièvement le problème.');
    return { ...d, reports: [...d.reports, { friendId, reason: reason.trim().slice(0, 500), at: env.now }] };
  });
}

/** Score partagé calculé localement à partir de données non financières (nombre d'actions ou % d'objectif). */
export function myChallengeScore(d: UserData, type: ChallengeType, from: DateStr, to: DateStr): number {
  if (!d.profile.shareInChallenges) return 0;
  const inRange = (x: string) => x.slice(0, 10) >= from && x.slice(0, 10) <= to;
  switch (type) {
    case 'quests_count':
      return sanitizeSharedScore(type, d.userQuests.filter((q) => q.status === 'completed' && q.completedAt && inRange(q.completedAt)).length);
    case 'habit_regularity':
    case 'collective_habits':
      return sanitizeSharedScore(type, d.habitCompletions.filter((c) => inRange(c.date)).length);
    case 'weekly_review':
      return sanitizeSharedScore(type, d.weeklyReviews.filter((w) => inRange(w.date)).length);
    case 'goal_progress':
      return sanitizeSharedScore(type, Math.max(0, ...d.goals.filter((g) => !g.archivedAt).map((g) => Math.floor(goalProgress(g, d.entries).ratio * 100))));
  }
}

export function createChallenge(data: UserData, input: { type: ChallengeType; title: string; days: number; friendIds: string[]; collectiveTarget?: number | null }, env: Env): Result {
  return run(data, env, (d) => {
    const title = input.title.trim();
    if (title.length < 3 || title.length > 60) fail('Titre de 3 à 60 caractères.');
    if (input.days < 3 || input.days > 60) fail('Durée de 3 à 60 jours.');
    const friends = d.friends.filter((f) => f.status === 'accepted' && input.friendIds.includes(f.id));
    if (friends.length === 0) fail('Invite au moins un ami.');
    const endDate = addDays(env.today, input.days - 1);
    return {
      ...d,
      challenges: [
        ...d.challenges,
        {
          id: env.id(),
          type: input.type,
          title,
          startDate: env.today,
          endDate,
          collectiveTarget: input.type === 'collective_habits' ? input.collectiveTarget ?? 20 : null,
          visibility: 'private',
          createdBy: 'me',
          participants: [
            { userId: 'me', pseudo: d.profile.pseudo, avatar: d.profile.avatar, sharedScore: myChallengeScore(d, input.type, env.today, endDate), left: false },
            ...friends.map((f) => ({ userId: f.id, pseudo: f.pseudo, avatar: f.avatar, sharedScore: 0, left: false })),
          ],
        },
      ],
    };
  });
}

export function leaveChallenge(data: UserData, challengeId: string, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    challenges: d.challenges.map((c) => (c.id === challengeId ? { ...c, participants: c.participants.map((p) => (p.userId === 'me' ? { ...p, left: true } : p)) } : c)),
  }));
}

export function refreshMyScores(data: UserData, env: Env): Result {
  return run(data, env, (d) => ({
    ...d,
    challenges: d.challenges.map((c) => ({
      ...c,
      participants: c.participants.map((p) => (p.userId === 'me' && !p.left ? { ...p, pseudo: d.profile.pseudo, avatar: d.profile.avatar, sharedScore: myChallengeScore(d, c.type, c.startDate, c.endDate) } : p)),
    })),
  }));
}

// ——— Prévisions ———

export function saveForecast(data: UserData, input: { grocery: GroceryInput; fuel: FuelInput }, env: Env): Result {
  return run(data, env, (d) => {
    const err = validateGrocery(input.grocery) ?? validateFuel(input.fuel);
    if (err) fail(err);
    return { ...d, forecast: { grocery: input.grocery, fuel: input.fuel, updatedAt: env.now } };
  });
}

/** Transforme la prévision en budgets mensuels « Alimentation » et « Transport » (arrondis à l'euro supérieur). */
export function applyForecastBudgets(data: UserData, input: { grocery: GroceryInput; fuel: FuelInput }, env: Env): Result {
  const groceries = Math.ceil(groceryForecast(input.grocery).monthlyMinor / 100) * 100;
  const fuel = Math.ceil(fuelForecast(input.fuel).monthlyMinor / 100) * 100;
  let r = saveForecast(data, input, env);
  if (r.error) return r;
  r = upsertBudget(r.data, { category: 'groceries', limitMinor: groceries, period: 'month' }, env);
  if (r.error || fuel <= 0) return r;
  return upsertBudget(r.data, { category: 'transport', limitMinor: fuel, period: 'month' }, env);
}

// ——— Entrées et sorties fixes ———

export function addFixedItem(data: UserData, input: Omit<FixedItem, 'id'>, env: Env): Result {
  return run(data, env, (d) => {
    const label = input.label.trim();
    if (label.length < 2 || label.length > 40) fail('Nom de 2 à 40 caractères.');
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > 10_000_000) fail('Montant invalide.');
    if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) fail('Jour du mois entre 1 et 31.');
    if ((d.fixedItems ?? []).length >= 20) fail('20 entrées fixes au maximum.');
    const keyword = input.keyword?.trim() || null;
    return { ...d, fixedItems: [...(d.fixedItems ?? []), { id: env.id(), label, amountMinor: input.amountMinor, direction: input.direction, day: input.day, keyword }] };
  });
}

export function removeFixedItem(data: UserData, id: string, env: Env): Result {
  return run(data, env, (d) => ({ ...d, fixedItems: (d.fixedItems ?? []).filter((x) => x.id !== id) }));
}

/** Jauge du réservoir indiquée aujourd'hui (0 à 1), sans toucher au reste de la prévision. */
export function setFuelGauge(data: UserData, gauge: number | null, env: Env): Result {
  return run(data, env, (d) => {
    if (!d.forecast) fail('Enregistre d’abord ta prévision.');
    if (gauge !== null && !(gauge >= 0 && gauge <= 1)) fail('Jauge invalide.');
    return { ...d, forecast: { ...d.forecast!, fuel: { ...d.forecast!.fuel, gauge, gaugeDate: gauge === null ? null : env.today } } };
  });
}
