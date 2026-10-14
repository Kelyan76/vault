-- VAULT — connexions bancaires, comptes, transactions, synchronisations, webhooks.
-- Toutes ces tables sont écrites exclusivement par les Edge Functions (service_role).
-- Le client ne peut que lire ses propres lignes, et jamais les identifiants du prestataire.

create type public.connection_status as enum (
  'not_connected', 'pending_authorization', 'connected', 'syncing',
  'consent_expired', 'action_required', 'sync_error', 'disconnected'
);

-- Référence de l'utilisateur chez le prestataire : table sans aucun accès client.
create table public.bank_provider_users (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('bridge', 'powens')),
  provider_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, provider_user_id)
);
alter table public.bank_provider_users enable row level security;
revoke all on public.bank_provider_users from anon, authenticated;

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('bridge', 'powens', 'demo')),
  provider_connection_id text not null,
  status public.connection_status not null default 'pending_authorization',
  provider_status_code text,
  institution_name text,
  consent_expires_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_attempt_at timestamptz,
  -- Curseur de synchronisation incrémentale (date de mise à jour côté prestataire).
  sync_cursor timestamptz,
  first_transaction_date date,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_connection_id)
);
create index bank_connections_user_idx on public.bank_connections (user_id);

-- Vue client sans l'identifiant du prestataire.
create view public.my_bank_connections with (security_invoker = true) as
  select id, provider, status, institution_name, consent_expires_at, last_successful_sync_at,
         last_sync_attempt_at, first_transaction_date, disconnected_at, created_at
  from public.bank_connections;

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  provider_account_id text not null,
  name text,
  type text not null default 'other' check (type in ('checking', 'savings', 'card', 'loan', 'investment', 'other')),
  balance_minor bigint,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  iban_last4 text check (iban_last4 is null or char_length(iban_last4) <= 4),
  data_access boolean not null default true,
  provider_updated_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_account_id)
);
create index bank_accounts_user_idx on public.bank_accounts (user_id);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  account_id uuid references public.bank_accounts (id) on delete cascade,
  provider_transaction_id text not null,
  provider_account_id text not null,
  booking_date date not null,
  label text not null,
  amount_minor bigint not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  provider_category text,
  operation_type text,
  status text not null default 'booked' check (status in ('booked', 'pending')),
  removed boolean not null default false,
  source text not null default 'bank' check (source in ('bank', 'demo')),
  provider_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Clé de déduplication : un identifiant prestataire n'existe qu'une fois par connexion.
  unique (connection_id, provider_transaction_id)
);
create index bank_transactions_user_date_idx on public.bank_transactions (user_id, booking_date desc) where not removed;
create index bank_transactions_account_idx on public.bank_transactions (account_id, booking_date desc);
create index bank_transactions_label_idx on public.bank_transactions (user_id, lower(label));

-- Corrections de l'utilisateur : séparées, survivent à toutes les synchronisations.
create table public.transaction_category_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions (id) on delete cascade,
  category text check (category in ('groceries', 'restaurants', 'transport', 'housing', 'subscriptions', 'shopping', 'leisure', 'health', 'income', 'savings_transfers', 'other')),
  kind text check (kind in ('expense', 'income', 'refund', 'internal_transfer', 'savings_transfer')),
  updated_at timestamptz not null default now(),
  primary key (bank_transaction_id),
  check (category is not null or kind is not null)
);
create index transaction_overrides_user_idx on public.transaction_category_overrides (user_id);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  trigger text not null check (trigger in ('initial', 'manual', 'webhook', 'scheduled', 'retry')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  attempt integer not null default 1,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  removed_count integer not null default 0,
  error_code text,
  next_retry_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
-- Une seule synchronisation en cours par connexion : protège contre les exécutions simultanées.
create unique index sync_jobs_one_running on public.sync_jobs (connection_id) where status = 'running';
create index sync_jobs_connection_idx on public.sync_jobs (connection_id, created_at desc);

-- Tentatives de connexion : le paramètre `state` relie le retour du prestataire à l'utilisateur.
create table public.bank_connect_attempts (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  connection_id uuid references public.bank_connections (id) on delete cascade,
  consent_version text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Webhooks déjà traités : rejouer un événement ne fait rien.
create table public.webhook_events (
  provider text not null,
  event_hash text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_hash)
);

alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.transaction_category_overrides enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.bank_connect_attempts enable row level security;
alter table public.webhook_events enable row level security;

create policy "connexions : lecture de soi" on public.bank_connections for select using (user_id = auth.uid());
create policy "comptes : lecture de soi" on public.bank_accounts for select using (user_id = auth.uid());
create policy "transactions : lecture de soi" on public.bank_transactions for select using (user_id = auth.uid());
create policy "synchronisations : lecture de soi" on public.sync_jobs for select using (user_id = auth.uid());

create policy "corrections : lecture" on public.transaction_category_overrides for select using (user_id = auth.uid());
create policy "corrections : ajout" on public.transaction_category_overrides for insert with check (
  user_id = auth.uid() and exists (select 1 from public.bank_transactions t where t.id = bank_transaction_id and t.user_id = auth.uid())
);
create policy "corrections : modification" on public.transaction_category_overrides for update using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.bank_transactions t where t.id = bank_transaction_id and t.user_id = auth.uid())
);
create policy "corrections : suppression" on public.transaction_category_overrides for delete using (user_id = auth.uid());

-- Données du prestataire et références : aucune écriture client, et pas même la lecture des colonnes d'identifiants.
revoke insert, update, delete on public.bank_connections, public.bank_accounts, public.bank_transactions, public.sync_jobs from anon, authenticated;
revoke select on public.bank_connections from anon, authenticated;
grant select (id, user_id, provider, status, institution_name, consent_expires_at, last_successful_sync_at, last_sync_attempt_at, first_transaction_date, disconnected_at, created_at, updated_at)
  on public.bank_connections to authenticated;
revoke select on public.bank_accounts from anon, authenticated;
grant select (id, user_id, connection_id, name, type, balance_minor, currency, iban_last4, data_access, synced_at, created_at, updated_at)
  on public.bank_accounts to authenticated;
revoke all on public.bank_connect_attempts, public.webhook_events from anon, authenticated;
grant select on public.my_bank_connections to authenticated;

create trigger bank_connections_touch before update on public.bank_connections for each row execute function public.touch_updated_at();
create trigger bank_accounts_touch before update on public.bank_accounts for each row execute function public.touch_updated_at();
create trigger bank_transactions_touch before update on public.bank_transactions for each row execute function public.touch_updated_at();

-- Prise de verrou de synchronisation (appelée par l'Edge Function) : renvoie null si une synchro tourne déjà.
create function public.begin_sync(p_connection uuid, p_trigger text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  job uuid;
  owner uuid;
begin
  select user_id into owner from public.bank_connections where id = p_connection and disconnected_at is null;
  if owner is null then
    return null;
  end if;
  -- Une synchro « running » depuis plus de 15 minutes est considérée comme abandonnée.
  update public.sync_jobs set status = 'failed', error_code = 'timeout', finished_at = now()
    where connection_id = p_connection and status = 'running' and started_at < now() - interval '15 minutes';
  begin
    insert into public.sync_jobs (user_id, connection_id, trigger, status, started_at)
      values (owner, p_connection, p_trigger, 'running', now()) returning id into job;
  exception when unique_violation then
    return null;
  end;
  update public.bank_connections set last_sync_attempt_at = now() where id = p_connection;
  return job;
end $$;
revoke execute on function public.begin_sync(uuid, text) from public, anon, authenticated;
