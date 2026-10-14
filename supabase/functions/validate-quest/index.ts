// POST /functions/v1/validate-quest   Corps : { userQuestId, declare?: boolean }
// Réévalue la quête côté serveur avec le même moteur que l'appli (domain/quests.ts) ;
// le client ne peut jamais marquer une quête comme réussie ni s'attribuer de l'XP.
import { adminClient, corsHeaders, json, readJson, requireUser } from '../_shared/server/context.ts';
import { buildQuestContext } from '../_shared/server/quest-context.ts';
import { evaluateQuest, questById, type UserQuest } from '../_shared/domain/quests.ts';
import { addDays } from '../_shared/domain/dates.ts';
import { xpKeys, XP_RULES } from '../_shared/domain/xp.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await readJson<{ userQuestId?: string; declare?: boolean }>(req);
  if (!body?.userQuestId) return json({ error: 'quest_required' }, 400);

  const db = adminClient();
  const { data: uq } = await db.from('user_quests').select('*').eq('id', body.userQuestId).eq('user_id', user.id).maybeSingle();
  if (!uq) return json({ error: 'not_found' }, 404);
  const def = questById(uq.quest_id);
  if (!def) return json({ error: 'unknown_quest' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const since = addDays(uq.start_date, -Math.max(def.durationDays, 7) - 1);
  const uid = user.id;
  const [profile, connections, accounts, bankTx, overrides, manualTx, entries, allocations, goals, budgets, habits, reviews] = await Promise.all([
    db.from('profiles').select('default_currency').eq('id', uid).single(),
    db.from('bank_connections').select('status, provider, last_successful_sync_at, first_transaction_date, disconnected_at').eq('user_id', uid),
    db.from('bank_accounts').select('id, type').eq('user_id', uid),
    db.from('bank_transactions').select('id, account_id, booking_date, label, amount_minor, currency, provider_category, status, removed, source, created_at').eq('user_id', uid).gte('booking_date', since),
    db.from('transaction_category_overrides').select('bank_transaction_id, category, kind, updated_at').eq('user_id', uid),
    db.from('manual_transactions').select('id, booking_date, label, amount_minor, currency, category, kind, created_at').eq('user_id', uid).gte('booking_date', since),
    db.from('savings_transactions').select('id, kind, amount_minor, currency, entry_date, source_transaction_id, created_at, updated_at').eq('user_id', uid),
    db.from('goal_allocations').select('savings_transaction_id, goal_id, amount_minor').eq('user_id', uid),
    db.from('savings_goals').select('id, name, target_minor, currency, deadline, icon, created_at, archived_at').eq('user_id', uid),
    db.from('budget_categories').select('id, category, limit_minor, budgets!inner(period, currency)').eq('user_id', uid),
    db.from('habit_completions').select('habit_id, completed_on, habits!inner(template)').eq('user_id', uid).gte('completed_on', uq.start_date),
    db.from('weekly_reviews').select('created_at').eq('user_id', uid),
  ]);

  const ctx = buildQuestContext({
    today,
    currency: profile.data?.default_currency ?? 'EUR',
    connections: connections.data ?? [],
    accounts: accounts.data ?? [],
    bankTransactions: bankTx.data ?? [],
    overrides: overrides.data ?? [],
    manualTransactions: manualTx.data ?? [],
    savingsEntries: entries.data ?? [],
    allocations: allocations.data ?? [],
    goals: goals.data ?? [],
    // deno-lint-ignore no-explicit-any
    budgets: (budgets.data ?? []).map((b: any) => ({ id: b.id, category: b.category, limit_minor: b.limit_minor, period: b.budgets.period, currency: b.budgets.currency })),
    // deno-lint-ignore no-explicit-any
    habitCompletions: (habits.data ?? []).map((h: any) => ({ habit_id: h.habit_id, completed_on: h.completed_on, habit_template: h.habits.template })),
    weeklyReviews: reviews.data ?? [],
  });

  const quest: UserQuest = {
    id: uq.id,
    questId: uq.quest_id,
    startDate: uq.start_date,
    endDate: uq.end_date,
    status: uq.status,
    checkedSteps: uq.checked_steps ?? [],
    manualCount: uq.manual_count ?? 0,
    evidence: uq.evidence,
  };
  const evaluation = evaluateQuest(def, quest, ctx);
  const declared = body.declare === true && evaluation.canDeclareManually;
  if (evaluation.state !== 'ready' && !declared) return json({ completed: false, evaluation });

  const evidence = declared ? 'declared' : evaluation.evidence;
  const { data: done } = await db
    .from('user_quests')
    .update({ status: 'completed', completed_at: new Date().toISOString(), evidence })
    .eq('id', uq.id)
    .eq('status', 'active')
    .select('id');
  if (!done?.length) return json({ completed: false, evaluation });

  const rewards: { key: string; amount: number }[] = [];
  const award = async (key: string, reason: string, amount: number, label: string) => {
    const { data } = await db.rpc('award_xp', { p_user: uid, p_key: key, p_reason: reason, p_amount: amount, p_label: label });
    if (data) rewards.push({ key, amount });
  };
  await award(xpKeys.quest(def.id, uq.start_date), 'quest_completed', def.xp, def.title);
  await award(xpKeys.firstQuest(), 'first_quest', XP_RULES.first_quest, 'Première quête terminée');
  await db.rpc('unlock_achievement', { p_user: uid, p_id: 'first_quest' });
  await db.rpc('audit', { p_user: uid, p_action: 'quest.completed', p_target: def.id, p_meta: { evidence } });
  return json({ completed: true, evidence, rewards, evaluation });
});
