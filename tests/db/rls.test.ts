import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { QUEST_CATALOG } from '../../supabase/functions/_shared/domain/quests.ts';
import { xpForLevel } from '../../supabase/functions/_shared/domain/xp.ts';
import { asUser, createTestDb, createUser, expectError, seedBank, U1, U2, U3, type Db } from './harness.ts';

let db: Db;
let bank1: Awaited<ReturnType<typeof seedBank>>;
let bank2: Awaited<ReturnType<typeof seedBank>>;

before(async () => {
  db = await createTestDb();
  await createUser(db, U1, 'alice');
  await createUser(db, U2, 'bruno');
  await createUser(db, U3);
  bank1 = await seedBank(db, U1, 'a');
  bank2 = await seedBank(db, U2, 'b');
});

test('profil et progression créés à l’inscription', async () => {
  const p = await db.query<{ pseudo: string }>('select pseudo from public.profiles order by pseudo');
  assert.deepEqual(p.rows.map((r) => r.pseudo).sort(), ['alice', 'bruno', 'joueur_33333333']);
  const g = await db.query<{ xp_total: number }>('select xp_total from public.user_progress where user_id = $1', [U1]);
  assert.equal(g.rows[0].xp_total, 0);
});

test('données bancaires : chacun ne lit que les siennes', async () => {
  const mine = await asUser(db, U1, (tx) => tx.query<{ id: string }>('select id from public.bank_transactions'));
  assert.deepEqual(mine.rows.map((r) => r.id), [bank1.transactionId]);
  const accounts = await asUser(db, U1, (tx) => tx.query('select id, name, balance_minor from public.bank_accounts'));
  assert.equal(accounts.rows.length, 1);
  const anon = await asUser(db, null, (tx) => tx.query('select id from public.bank_transactions'));
  assert.equal(anon.rows.length, 0);
});

test('données bancaires : aucune écriture client, ni création ni modification', async () => {
  assert.match((await expectError(db, U1, (tx) => tx.query("update public.bank_transactions set amount_minor = 1 where id = $1", [bank1.transactionId])))!, /permission denied/);
  assert.match(
    (await expectError(db, U1, (tx) =>
      tx.query(
        "insert into public.bank_connections (user_id, provider, provider_connection_id, status) values ($1, 'bridge', 'fake', 'connected')",
        [U1],
      ),
    ))!,
    /permission denied/,
  );
  assert.match((await expectError(db, U1, (tx) => tx.query('delete from public.bank_transactions')))!, /permission denied/);
});

test('identifiants du prestataire illisibles par le client', async () => {
  assert.match((await expectError(db, U1, (tx) => tx.query('select provider_connection_id from public.bank_connections')))!, /permission denied/);
  assert.match((await expectError(db, U1, (tx) => tx.query('select * from public.bank_provider_users')))!, /permission denied/);
  const view = await asUser(db, U1, (tx) => tx.query<{ status: string }>('select * from public.my_bank_connections'));
  assert.equal(view.rows.length, 1);
  assert.equal(Object.keys(view.rows[0]).includes('provider_connection_id'), false);
});

test('corrections de catégorie : sur ses propres opérations uniquement, et conservées à la resynchronisation', async () => {
  await asUser(db, U1, (tx) => tx.query("insert into public.transaction_category_overrides (user_id, bank_transaction_id, category) values ($1, $2, 'leisure')", [U1, bank1.transactionId]));
  const err = await expectError(db, U1, (tx) =>
    tx.query("insert into public.transaction_category_overrides (user_id, bank_transaction_id, category) values ($1, $2, 'leisure')", [U1, bank2.transactionId]),
  );
  assert.match(err!, /row-level security/);
  // Resynchronisation (upsert serveur) : montant mis à jour, correction intacte.
  await db.query(
    `insert into public.bank_transactions (user_id, connection_id, account_id, provider_transaction_id, provider_account_id, booking_date, label, amount_minor, currency)
     values ($1, $2, $3, 'tx-a', 'acc-a', '2026-10-10', 'CB LIDL', -2600, 'EUR')
     on conflict (connection_id, provider_transaction_id) do update set amount_minor = excluded.amount_minor`,
    [U1, bank1.connectionId, bank1.accountId],
  );
  const n = await db.query<{ n: number }>('select count(*)::int n from public.bank_transactions where user_id = $1', [U1]);
  assert.equal(n.rows[0].n, 1);
  const o = await db.query<{ category: string }>('select category from public.transaction_category_overrides where bank_transaction_id = $1', [bank1.transactionId]);
  assert.equal(o.rows[0].category, 'leisure');
});

test('données personnelles : isolation des objectifs, budgets, saisies manuelles', async () => {
  const goal = await asUser(db, U1, (tx) => tx.query<{ id: string }>("insert into public.savings_goals (name, target_minor) values ('Voyage', 50000) returning id"));
  const goalId = goal.rows[0].id;
  const seen = await asUser(db, U2, (tx) => tx.query('select * from public.savings_goals'));
  assert.equal(seen.rows.length, 0);
  // U2 ne peut pas créer une ligne au nom de U1.
  assert.match((await expectError(db, U2, (tx) => tx.query("insert into public.manual_transactions (user_id, booking_date, label, amount_minor) values ($1, '2026-10-10', 'x', -100)", [U1])))!, /row-level security/);
  // Ni rattacher une écriture à l'objectif de quelqu'un d'autre.
  const err = await expectError(db, U2, async (tx) => {
    const e = await tx.query<{ id: string }>("insert into public.savings_transactions (kind, amount_minor, entry_date) values ('declared', 1000, '2026-10-10') returning id");
    await tx.query('insert into public.goal_allocations (savings_transaction_id, goal_id, amount_minor) values ($1, $2, 1000)', [e.rows[0].id, goalId]);
  });
  assert.match(err!, /row-level security/);
  // Ni déclarer comme « virement observé » l'opération bancaire d'un autre.
  const err2 = await expectError(db, U2, (tx) =>
    tx.query("insert into public.savings_transactions (kind, amount_minor, entry_date, source_transaction_id) values ('observed_transfer', 2500, '2026-10-10', $1)", [bank1.transactionId]),
  );
  assert.match(err2!, /row-level security/);
});

test('virement observé : une seule fois dans le coffre', async () => {
  const insert = (tx: Parameters<Parameters<typeof asUser>[2]>[0]) =>
    tx.query("insert into public.savings_transactions (kind, amount_minor, entry_date, source_transaction_id) values ('observed_transfer', 2600, '2026-10-10', $1)", [bank1.transactionId]);
  await asUser(db, U1, insert);
  assert.match((await expectError(db, U1, insert))!, /duplicate key/);
});

test('XP : impossible à s’attribuer soi-même, idempotente côté serveur', async () => {
  assert.match((await expectError(db, U1, (tx) => tx.query("select public.award_xp($1, 'x', 'quest_completed', 500, 'triche')", [U1])))!, /permission denied/);
  assert.match((await expectError(db, U1, (tx) => tx.query("insert into public.xp_transactions (user_id, idempotency_key, reason, amount, label) values ($1, 'k1', 'quest_completed', 500, 'x')", [U1])))!, /permission denied/);
  assert.match((await expectError(db, U1, (tx) => tx.query('update public.user_progress set xp_total = 99999')))!, /permission denied/);
  const a = await db.query<{ r: boolean }>("select public.award_xp($1, 'quest:q-save-10:2026-10-10', 'quest_completed', 60, 'Quête') r", [U3]);
  const b = await db.query<{ r: boolean }>("select public.award_xp($1, 'quest:q-save-10:2026-10-10', 'quest_completed', 60, 'Quête') r", [U3]);
  assert.deepEqual([a.rows[0].r, b.rows[0].r], [true, false]);
  await db.query("select public.award_xp($1, 'key-two', 'quest_completed', 50, 'Quête')", [U3]);
  const p = await db.query<{ xp_total: number; level: number }>('select xp_total, level from public.user_progress where user_id = $1', [U3]);
  assert.equal(p.rows[0].xp_total, 110);
  assert.equal(p.rows[0].level, 2);
});

test('niveaux SQL alignés sur le moteur TypeScript', async () => {
  for (const lvl of [1, 2, 3, 4, 7, 12]) {
    const at = await db.query<{ l: number }>('select public.level_for_xp($1) l', [xpForLevel(lvl)]);
    const below = await db.query<{ l: number }>('select public.level_for_xp($1) l', [Math.max(0, xpForLevel(lvl) - 1)]);
    assert.equal(at.rows[0].l, lvl);
    assert.equal(below.rows[0].l, Math.max(1, lvl - 1));
  }
});

test('bilan hebdomadaire : une récompense par semaine', async () => {
  const first = await asUser(db, U2, (tx) => tx.query<{ r: boolean }>('select public.complete_weekly_review() r'));
  const second = await asUser(db, U2, (tx) => tx.query<{ r: boolean }>('select public.complete_weekly_review() r'));
  assert.deepEqual([first.rows[0].r, second.rows[0].r], [true, false]);
  const xp = await asUser(db, U2, (tx) => tx.query<{ n: number }>('select count(*)::int n from public.xp_transactions'));
  assert.equal(xp.rows[0].n, 1);
});

test('quêtes : le client ne peut pas se déclarer vainqueur', async () => {
  const uq = await asUser(db, U1, (tx) => tx.query<{ id: string; end_date: string }>("insert into public.user_quests (quest_id) values ('q-home-meals') returning id, end_date::text"));
  assert.ok(uq.rows[0].end_date);
  const id = uq.rows[0].id;
  await asUser(db, U1, (tx) => tx.query('update public.user_quests set manual_count = 2 where id = $1', [id]));
  assert.match((await expectError(db, U1, (tx) => tx.query("update public.user_quests set status = 'completed' where id = $1", [id])))!, /row-level security/);
  assert.match((await expectError(db, U1, (tx) => tx.query("update public.user_quests set evidence = 'bank_data' where id = $1", [id])))!, /permission denied/);
  assert.match((await expectError(db, U1, (tx) => tx.query("insert into public.user_quests (quest_id, status) values ('q-save-10', 'completed')")))!, /row-level security/);
  // Une seule instance active par quête.
  assert.match((await expectError(db, U1, (tx) => tx.query("insert into public.user_quests (quest_id) values ('q-home-meals')")))!, /duplicate key/);
});

test('catalogue SQL des quêtes identique au catalogue TypeScript', async () => {
  const rows = await db.query<{ id: string; xp: number; rule: unknown }>('select id, xp, rule from public.quests order by id');
  const expected = [...QUEST_CATALOG].sort((a, b) => a.id.localeCompare(b.id)).map((q) => ({ id: q.id, xp: q.xp, rule: q.rule }));
  assert.deepEqual(rows.rows, expected);
});

test('objectif atteint : récompense refusée pour un objectif créé à l’instant', async () => {
  const r = await asUser(db, U1, async (tx) => {
    const g = await tx.query<{ id: string }>("insert into public.savings_goals (name, target_minor) values ('Mini', 1000) returning id");
    const e = await tx.query<{ id: string }>("insert into public.savings_transactions (kind, amount_minor, entry_date) values ('declared', 1000, current_date) returning id");
    await tx.query('insert into public.goal_allocations (savings_transaction_id, goal_id, amount_minor) values ($1, $2, 1000)', [e.rows[0].id, g.rows[0].id]);
    return tx.query<{ r: boolean }>('select public.claim_goal_reward($1) r', [g.rows[0].id]);
  });
  assert.equal(r.rows[0].r, false);
});

test('amis : seuls pseudo et avatar sont visibles, jamais les finances', async () => {
  // Avant amitié : invisible.
  const before = await asUser(db, U2, (tx) => tx.query('select * from public.public_profiles($1)', [[U1]]));
  assert.equal(before.rows.length, 0);
  const found = await asUser(db, U2, (tx) => tx.query<{ id: string }>("select * from public.find_profile_by_pseudo('ALICE')"));
  assert.equal(found.rows[0].id, U1);
  const f = await asUser(db, U2, (tx) => tx.query<{ id: string }>('insert into public.friendships (addressee_id) values ($1) returning id', [U1]));
  // Le demandeur ne peut pas accepter à la place du destinataire.
  const sneaky = await asUser(db, U2, (tx) => tx.query("update public.friendships set status = 'accepted' where id = $1", [f.rows[0].id]));
  assert.equal(sneaky.affectedRows, 0);
  await asUser(db, U1, (tx) => tx.query("update public.friendships set status = 'accepted', responded_at = now() where id = $1", [f.rows[0].id]));
  const after = await asUser(db, U2, (tx) => tx.query('select * from public.public_profiles($1)', [[U1]]));
  assert.deepEqual(Object.keys(after.rows[0] as object).sort(), ['avatar', 'id', 'pseudo']);
  // Toujours aucun accès aux données financières de l'ami.
  for (const table of ['bank_transactions', 'savings_goals', 'manual_transactions', 'user_progress', 'xp_transactions', 'budgets', 'savings_transactions']) {
    const r = await asUser(db, U2, (tx) => tx.query(`select * from public.${table} where user_id = $1`, [U1]));
    assert.equal(r.rows.length, 0, table);
  }
  // La table profiles complète (devise, préférences) reste privée, même entre amis.
  const raw = await asUser(db, U2, (tx) => tx.query('select * from public.profiles where id = $1', [U1]));
  assert.equal(raw.rows.length, 0);
});

test('défis : score calculé par le serveur, non modifiable par le participant', async () => {
  const c = await asUser(db, U1, (tx) =>
    tx.query<{ id: string }>("insert into public.challenges (type, title, start_date, end_date) values ('weekly_review', 'Bilans', current_date - 1, current_date + 7) returning id"),
  );
  const cid = c.rows[0].id;
  await asUser(db, U1, (tx) => tx.query("insert into public.challenge_participants (challenge_id, user_id) values ($1, $2), ($1, $3)", [cid, U1, U2]));
  // Inviter un non-ami est refusé.
  assert.match((await expectError(db, U1, (tx) => tx.query('insert into public.challenge_participants (challenge_id, user_id) values ($1, $2)', [cid, U3])))!, /row-level security/);
  await asUser(db, U2, (tx) => tx.query("update public.challenge_participants set status = 'joined', joined_at = now() where challenge_id = $1 and user_id = $2", [cid, U2]));
  assert.match((await expectError(db, U2, (tx) => tx.query('update public.challenge_participants set shared_score = 999 where challenge_id = $1 and user_id = $2', [cid, U2])))!, /permission denied/);
  const score = await asUser(db, U2, (tx) => tx.query<{ s: number }>('select public.refresh_challenge_score($1) s', [cid]));
  assert.equal(score.rows[0].s, 1); // le bilan fait plus haut
  // Les autres participants voient le score, rien d'autre.
  const rows = await asUser(db, U1, (tx) => tx.query<{ user_id: string; shared_score: number }>('select user_id, shared_score from public.challenge_participants where challenge_id = $1', [cid]));
  assert.equal(rows.rows.find((r) => r.user_id === U2)?.shared_score, 1);
  // Un non-participant ne voit pas le défi.
  const outsider = await asUser(db, U3, (tx) => tx.query('select * from public.challenges where id = $1', [cid]));
  assert.equal(outsider.rows.length, 0);
  // Quitter le défi.
  await asUser(db, U2, (tx) => tx.query("update public.challenge_participants set status = 'left' where challenge_id = $1 and user_id = $2", [cid, U2]));
});

test('synchronisation : jamais deux en même temps sur une connexion', async () => {
  const a = await db.query<{ j: string | null }>("select public.begin_sync($1, 'manual') j", [bank1.connectionId]);
  const b = await db.query<{ j: string | null }>("select public.begin_sync($1, 'webhook') j", [bank1.connectionId]);
  assert.ok(a.rows[0].j);
  assert.equal(b.rows[0].j, null);
  await db.query("update public.sync_jobs set status = 'succeeded', finished_at = now() where id = $1", [a.rows[0].j]);
  const c = await db.query<{ j: string | null }>("select public.begin_sync($1, 'manual') j", [bank1.connectionId]);
  assert.ok(c.rows[0].j);
  assert.match((await expectError(db, U1, (tx) => tx.query("select public.begin_sync($1, 'manual')", [bank1.connectionId])))!, /permission denied/);
});

test('déconnexion bancaire : historique conservé ou supprimé au choix', async () => {
  await db.query('select public.finalize_bank_disconnection($1, false)', [bank2.connectionId]);
  const kept = await db.query<{ n: number }>('select count(*)::int n from public.bank_transactions where connection_id = $1', [bank2.connectionId]);
  assert.equal(kept.rows[0].n, 1);
  const st = await db.query<{ status: string }>('select status from public.bank_connections where id = $1', [bank2.connectionId]);
  assert.equal(st.rows[0].status, 'disconnected');
  // Synchronisation impossible une fois déconnectée.
  const j = await db.query<{ j: string | null }>("select public.begin_sync($1, 'manual') j", [bank2.connectionId]);
  assert.equal(j.rows[0].j, null);

  await db.query('select public.finalize_bank_disconnection($1, true)', [bank1.connectionId]);
  const gone = await db.query<{ n: number }>('select count(*)::int n from public.bank_transactions where connection_id = $1', [bank1.connectionId]);
  assert.equal(gone.rows[0].n, 0);
  // La mise de côté du coffre reste, détachée de l'opération supprimée ; la correction part avec l'opération.
  const entry = await db.query<{ source_transaction_id: string | null }>("select source_transaction_id from public.savings_transactions where user_id = $1 and kind = 'observed_transfer'", [U1]);
  assert.equal(entry.rows[0].source_transaction_id, null);
  const ov = await db.query<{ n: number }>('select count(*)::int n from public.transaction_category_overrides where user_id = $1', [U1]);
  assert.equal(ov.rows[0].n, 0);
  const audit = await db.query<{ action: string }>('select action from public.audit_log where user_id = $1', [U1]);
  assert.deepEqual(audit.rows.map((r) => r.action), ['bank.disconnect_and_delete']);
});

test('suppression du compte : toutes les données partent en cascade', async () => {
  const summary = await asUser(db, U1, (tx) => tx.query<{ s: Record<string, number> }>('select public.my_data_summary() s'));
  assert.equal(typeof summary.rows[0].s.goals, 'number');
  await db.query('delete from auth.users where id = $1', [U1]);
  const tables = ['profiles', 'user_progress', 'bank_connections', 'bank_accounts', 'bank_transactions', 'savings_goals', 'savings_transactions', 'goal_allocations', 'user_quests', 'xp_transactions', 'bank_provider_users', 'challenge_participants'];
  for (const t of tables) {
    const col = t === 'profiles' ? 'id' : 'user_id';
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.${t} where ${col} = $1`, [U1]);
    assert.equal(r.rows[0].n, 0, t);
  }
  const f = await db.query<{ n: number }>('select count(*)::int n from public.friendships where $1 in (requester_id, addressee_id)', [U1]);
  assert.equal(f.rows[0].n, 0);
  // Le journal d'audit reste, anonymisé.
  const a = await db.query<{ n: number }>('select count(*)::int n from public.audit_log where user_id is null');
  assert.ok(a.rows[0].n >= 1);
});
