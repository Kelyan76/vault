// États initiaux. L'espace « démo » est entièrement fictif et le restera ;
// l'espace « personnel » démarre vide, avec quelques habitudes proposées.
import { addDays, type DateStr } from '../../supabase/functions/_shared/domain/dates.ts';
import { REVIEW_HABIT_ID, startQuest, questById } from '../../supabase/functions/_shared/domain/quests.ts';
import { connectDemoBank, type Env } from './actions.ts';
import type { UserData } from './types.ts';

export function emptyUserData(now: string, today: DateStr): UserData {
  return {
    version: 1,
    createdAt: now,
    profile: {
      pseudo: 'joueur',
      avatar: 'fox',
      currency: 'EUR',
      shareInChallenges: true,
      notifications: { quests: true, sync: true, challenges: true, weeklyReview: true },
    },
    bank: { connections: [], accounts: [], transactions: [], syncJobs: [] },
    manualTransactions: [],
    overrides: [],
    budgets: [],
    goals: [],
    entries: [],
    entryHistory: [],
    avoided: [],
    habits: [
      { id: REVIEW_HABIT_ID, name: 'Vérifier mon budget', frequency: 'daily', icon: 'eye', createdAt: now },
      { id: 'habit-plan-purchases', name: 'Planifier mes achats', frequency: 'weekly', icon: 'cart', createdAt: now },
      { id: 'habit-set-aside', name: 'Mettre une somme de côté', frequency: 'weekly', icon: 'coin', createdAt: now },
    ],
    habitCompletions: [],
    habitPauses: [],
    userQuests: [],
    xpLedger: [],
    achievements: [],
    weeklyReviews: [],
    activeDays: [today],
    friends: [],
    challenges: [],
    reports: [],
  };
}

/** Démo : historique fictif sur plusieurs semaines, pour montrer toutes les fonctions. */
export function demoUserData(env: Env): UserData {
  const { now, today } = env;
  const past = (days: number) => addDays(today, -days);
  const pastIso = (days: number) => `${past(days)}T10:00:00.000Z`;
  let d = emptyUserData(pastIso(40), today);
  d = {
    ...d,
    createdAt: pastIso(40),
    profile: { ...d.profile, pseudo: 'Camille_demo', avatar: 'fox' },
    habits: d.habits.map((h) => ({ ...h, createdAt: pastIso(40) })),
    budgets: [
      { id: 'demo-b1', category: 'restaurants', limitMinor: 18000, currency: 'EUR', period: 'month' },
      { id: 'demo-b2', category: 'leisure', limitMinor: 6000, currency: 'EUR', period: 'month' },
      { id: 'demo-b3', category: 'groceries', limitMinor: 30000, currency: 'EUR', period: 'month' },
      { id: 'demo-b4', category: 'shopping', limitMinor: 8000, currency: 'EUR', period: 'month' },
    ],
    goals: [
      { id: 'demo-g1', name: 'Voyage à Lisbonne', targetMinor: 60000, currency: 'EUR', deadline: addDays(today, 120), icon: 'plane', createdAt: pastIso(35) },
      { id: 'demo-g2', name: 'Fonds de sécurité', targetMinor: 100000, currency: 'EUR', deadline: null, icon: 'shield', createdAt: pastIso(30) },
      { id: 'demo-g3', name: 'Nouveau vélo', targetMinor: 25000, currency: 'EUR', deadline: addDays(today, 45), icon: 'bike', createdAt: pastIso(20) },
    ],
    entries: [
      { id: 'demo-e1', kind: 'declared', amountMinor: 15000, currency: 'EUR', date: past(33), note: 'Prime de fin de mission', allocations: [{ goalId: 'demo-g1', amountMinor: 15000 }], createdAt: pastIso(33), updatedAt: pastIso(33) },
      { id: 'demo-e2', kind: 'declared', amountMinor: 8000, currency: 'EUR', date: past(21), allocations: [{ goalId: 'demo-g2', amountMinor: 5000 }, { goalId: 'demo-g3', amountMinor: 3000 }], createdAt: pastIso(21), updatedAt: pastIso(21) },
      { id: 'demo-e3', kind: 'declared', amountMinor: 4500, currency: 'EUR', date: past(9), note: 'Vente sur Vinted', allocations: [{ goalId: 'demo-g3', amountMinor: 4500 }], createdAt: pastIso(9), updatedAt: pastIso(9) },
    ],
    avoided: [
      { id: 'demo-a1', label: 'Commande de sushis', plannedMinor: 2500, actualMinor: 700, currency: 'EUR', date: past(4), setAsideEntryId: null, createdAt: pastIso(4) },
    ],
    habitCompletions: [
      ...[0, 1, 2, 3, 5, 6, 7].map((n) => ({ habitId: REVIEW_HABIT_ID, date: past(n) })),
      ...[2, 9, 16].map((n) => ({ habitId: 'habit-plan-purchases', date: past(n) })),
      ...[8, 15].map((n) => ({ habitId: 'habit-set-aside', date: past(n) })),
    ],
    weeklyReviews: [{ date: past(14), mood: 'ok' }, { date: past(7), mood: 'serein' }],
    xpLedger: [
      { key: 'quest:q-subscriptions:' + past(30), reason: 'quest_completed', amount: 20, at: pastIso(28), label: 'Chasser un abonnement inutile' },
      { key: 'first_quest', reason: 'first_quest', amount: 25, at: pastIso(28), label: 'Première quête terminée' },
      { key: 'weekly_review:demo-1', reason: 'weekly_review', amount: 20, at: pastIso(14), label: 'Bilan hebdomadaire' },
      { key: 'weekly_review:demo-2', reason: 'weekly_review', amount: 20, at: pastIso(7), label: 'Bilan hebdomadaire' },
      { key: 'habit_streak:demo', reason: 'habit_streak', amount: 10, at: pastIso(5), label: 'Série de 3 : Vérifier mon budget' },
    ],
    activeDays: Array.from({ length: 12 }, (_, i) => past(i * 3)),
    friends: [
      { id: 'demo-f1', pseudo: 'Noah_demo', avatar: 'owl', status: 'accepted', demo: true },
      { id: 'demo-f2', pseudo: 'Lina_demo', avatar: 'panda', status: 'accepted', demo: true },
      { id: 'demo-f3', pseudo: 'Sam_demo', avatar: 'frog', status: 'pending_in', demo: true },
    ],
  };
  const sub = questById('q-subscriptions')!;
  const meals = questById('q-home-meals')!;
  const delivery = questById('q-delivery-down')!;
  const analyse = questById('q-analyse-7')!;
  d.userQuests = [
    { ...startQuest(sub, 'demo-uq0', past(30)), status: 'completed', checkedSteps: [0, 1, 2], completedAt: pastIso(28), evidence: 'declared' },
    { ...startQuest(meals, 'demo-uq1', past(2)), manualCount: 1 },
    startQuest(delivery, 'demo-uq2', past(3)),
    startQuest(analyse, 'demo-uq3', past(5)),
  ];
  d.achievements = [{ id: 'first_quest', at: pastIso(28) }, { id: 'first_streak', at: pastIso(5) }];
  d.challenges = [
    {
      id: 'demo-c1',
      type: 'quests_count',
      title: 'Course aux quêtes d’octobre',
      startDate: past(6),
      endDate: addDays(today, 8),
      collectiveTarget: null,
      visibility: 'private',
      createdBy: 'demo-f1',
      participants: [
        { userId: 'me', pseudo: 'Camille_demo', avatar: 'fox', sharedScore: 1, left: false },
        { userId: 'demo-f1', pseudo: 'Noah_demo', avatar: 'owl', sharedScore: 2, left: false },
        { userId: 'demo-f2', pseudo: 'Lina_demo', avatar: 'panda', sharedScore: 1, left: false },
      ],
    },
    {
      id: 'demo-c2',
      type: 'collective_habits',
      title: 'Ensemble : 40 habitudes',
      startDate: past(4),
      endDate: addDays(today, 10),
      collectiveTarget: 40,
      visibility: 'private',
      createdBy: 'me',
      participants: [
        { userId: 'me', pseudo: 'Camille_demo', avatar: 'fox', sharedScore: 6, left: false },
        { userId: 'demo-f2', pseudo: 'Lina_demo', avatar: 'panda', sharedScore: 9, left: false },
      ],
    },
  ];
  // Banque fictive connectée et synchronisée.
  return connectDemoBank(d, { ...env, now, space: 'demo' }).data;
}
