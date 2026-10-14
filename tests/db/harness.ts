// Banc de test SQL : les migrations VAULT dans PGlite (PostgreSQL en WASM) avec un shim minimal
// de Supabase (rôles anon / authenticated / service_role, schéma auth, auth.uid()).
// Les politiques RLS, privilèges de colonnes et fonctions sont donc testés pour de vrai, sans Docker.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  -- Privilèges par défaut identiques à Supabase : la sécurité repose sur RLS et sur les révocations explicites.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function createTestDb(): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} : ${(e as Error).message}`);
    }
  }
  return db;
}

export async function createUser(db: Db, id: string, pseudo?: string): Promise<string> {
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, `${id.slice(0, 8)}@test.local`, JSON.stringify(pseudo ? { pseudo } : {})]);
  return id;
}

/** Exécute fn comme PostgREST le ferait pour cet utilisateur : SET ROLE + claim JWT. */
export async function asUser<T>(db: Db, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    return fn(tx);
  });
}

export async function expectError(db: Db, userId: string | null, fn: (tx: Transaction) => Promise<unknown>): Promise<string | null> {
  try {
    await asUser(db, userId, fn);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export const U1 = '11111111-1111-4111-8111-111111111111';
export const U2 = '22222222-2222-4222-8222-222222222222';
export const U3 = '33333333-3333-4333-8333-333333333333';

/** Insère (en superutilisateur, comme une Edge Function) une connexion avec un compte et une opération. */
export async function seedBank(db: Db, userId: string, suffix: string) {
  const c = await db.query<{ id: string }>(
    `insert into public.bank_connections (user_id, provider, provider_connection_id, status) values ($1, 'bridge', $2, 'connected') returning id`,
    [userId, `item-${suffix}`],
  );
  const connectionId = c.rows[0].id;
  const a = await db.query<{ id: string }>(
    `insert into public.bank_accounts (user_id, connection_id, provider_account_id, name, type, balance_minor, currency) values ($1, $2, $3, 'Courant', 'checking', 123456, 'EUR') returning id`,
    [userId, connectionId, `acc-${suffix}`],
  );
  const t = await db.query<{ id: string }>(
    `insert into public.bank_transactions (user_id, connection_id, account_id, provider_transaction_id, provider_account_id, booking_date, label, amount_minor, currency)
     values ($1, $2, $3, $4, $5, '2026-10-10', 'CB LIDL', -2500, 'EUR') returning id`,
    [userId, connectionId, a.rows[0].id, `tx-${suffix}`, `acc-${suffix}`],
  );
  await db.query(`insert into public.bank_provider_users (user_id, provider, provider_user_id) values ($1, 'bridge', $2) on conflict do nothing`, [userId, `bridge-user-${suffix}`]);
  return { connectionId, accountId: a.rows[0].id, transactionId: t.rows[0].id };
}
