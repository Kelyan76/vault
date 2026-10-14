-- VAULT — saisie manuelle, budgets, épargne, dépenses évitées, habitudes, quêtes.

create function public.valid_category(c text) returns boolean language sql immutable as $$
  select c in ('groceries', 'restaurants', 'transport', 'housing', 'subscriptions', 'shopping', 'leisure', 'health', 'income', 'savings_transfers', 'other')
$$;

-- ——— Opérations saisies à la main (si pas de banque connectée) ———
create table public.manual_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  booking_date date not null check (booking_date > date '2000-01-01'),
  label text not null check (char_length(label) between 1 and 120),
  amount_minor bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 1000000000),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  category text not null default 'other' check (public.valid_category(category)),
  kind text not null default 'expense' check (kind in ('expense', 'income', 'refund', 'internal_transfer', 'savings_transfer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index manual_transactions_user_date_idx on public.manual_transactions (user_id, booking_date desc);

-- ——— Budgets ———
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period text not null check (period in ('week', 'month')),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, currency)
);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  category text not null check (public.valid_category(category) and category not in ('income', 'savings_transfers')),
  limit_minor bigint not null check (limit_minor > 0 and limit_minor <= 100000000),
  updated_at timestamptz not null default now(),
  unique (budget_id, category)
);

-- ——— Objectifs et coffre ———
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  target_minor bigint not null check (target_minor > 0 and target_minor <= 100000000),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  deadline date,
  icon text not null default 'star' check (icon in ('plane', 'laptop', 'shield', 'home', 'gift', 'bike', 'book', 'star')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index savings_goals_user_idx on public.savings_goals (user_id);

create table public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('declared', 'observed_transfer')),
  amount_minor bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 100000000),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  entry_date date not null,
  note text check (char_length(note) <= 200),
  source_transaction_id uuid references public.bank_transactions (id) on delete set null,
  avoided_expense_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un virement observé ne peut alimenter le coffre qu'une seule fois.
  unique (user_id, source_transaction_id)
);
create index savings_transactions_user_idx on public.savings_transactions (user_id, entry_date desc);

create table public.goal_allocations (
  savings_transaction_id uuid not null references public.savings_transactions (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount_minor bigint not null check (amount_minor <> 0),
  primary key (savings_transaction_id, goal_id)
);

create table public.avoided_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 2 and 80),
  planned_minor bigint not null check (planned_minor > 0),
  actual_minor bigint not null check (actual_minor >= 0),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  expense_date date not null,
  -- Estimation uniquement : la mise de côté réelle est une écriture distincte dans savings_transactions.
  set_aside_entry_id uuid references public.savings_transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  check (actual_minor <= planned_minor)
);
alter table public.savings_transactions
  add constraint savings_transactions_avoided_fk foreign key (avoided_expense_id) references public.avoided_expenses (id) on delete set null;

-- ——— Habitudes ———
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  frequency text not null check (frequency in ('daily', 'weekly')),
  icon text not null default 'eye',
  -- Habitude issue d'un modèle (ex. « check-budget », utilisée par la quête d'analyse 7 jours).
  template text check (template in ('check-budget', 'review-spending', 'plan-purchases', 'do-quest', 'set-aside')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, template)
);

create table public.habit_completions (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, completed_on),
  -- Pas de validation dans le futur ni de rattrapage au-delà de 2 jours.
  check (completed_on <= (created_at at time zone 'utc')::date + 1 and completed_on >= (created_at at time zone 'utc')::date - 2)
);

create table public.habit_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on and ends_on - starts_on <= 60)
);

-- ——— Quêtes ———
create table public.quests (
  id text primary key,
  title text not null,
  description text not null,
  category text not null,
  difficulty text not null,
  duration_days integer not null check (duration_days between 1 and 120),
  xp integer not null check (xp between 1 and 200),
  rule jsonb not null,
  manual_fallback boolean not null default false,
  active boolean not null default true
);

create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quest_id text not null references public.quests (id),
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'abandoned')),
  checked_steps integer[] not null default '{}',
  manual_count integer not null default 0 check (manual_count between 0 and 100),
  evidence text check (evidence in ('bank_data', 'app_activity', 'declared', 'demo_data')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Une seule instance active d'une même quête.
create unique index user_quests_one_active on public.user_quests (user_id, quest_id) where status = 'active';

create table public.weekly_reviews (
  user_id uuid not null references auth.users (id) on delete cascade,
  iso_week text not null check (iso_week ~ '^\d{4}-W\d{2}$'),
  mood text check (mood in ('serein', 'ok', 'tendu')),
  created_at timestamptz not null default now(),
  primary key (user_id, iso_week)
);

-- ——— RLS : chaque utilisateur ne voit et ne modifie que ses lignes ———
do $$
declare t text;
begin
  foreach t in array array['manual_transactions', 'budgets', 'budget_categories', 'savings_goals', 'savings_transactions',
                           'goal_allocations', 'avoided_expenses', 'habits', 'habit_completions', 'habit_pauses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s : lecture de soi" on public.%I for select using (user_id = auth.uid())', t, t);
    execute format('create policy "%s : ajout pour soi" on public.%I for insert with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s : modification de soi" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s : suppression de soi" on public.%I for delete using (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- Rattachements : on ne peut pointer que vers ses propres objets.
create policy "allocations : objectif et écriture à soi" on public.goal_allocations as restrictive for all using (true) with check (
  exists (select 1 from public.savings_goals g where g.id = goal_id and g.user_id = auth.uid())
  and exists (select 1 from public.savings_transactions s where s.id = savings_transaction_id and s.user_id = auth.uid())
);
create policy "budget : catégorie de son budget" on public.budget_categories as restrictive for all using (true) with check (
  exists (select 1 from public.budgets b where b.id = budget_id and b.user_id = auth.uid())
);
create policy "habitude : complétion de sa propre habitude" on public.habit_completions as restrictive for all using (true) with check (
  exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
);
create policy "coffre : virement observé de son propre compte" on public.savings_transactions as restrictive for all using (true) with check (
  source_transaction_id is null or exists (
    select 1 from public.bank_transactions t
    where t.id = source_transaction_id and t.user_id = auth.uid() and t.amount_minor < 0 and not t.removed
  )
);
create policy "évitée : mise de côté à soi" on public.avoided_expenses as restrictive for all using (true) with check (
  set_aside_entry_id is null or exists (select 1 from public.savings_transactions s where s.id = set_aside_entry_id and s.user_id = auth.uid())
);

alter table public.quests enable row level security;
alter table public.user_quests enable row level security;
alter table public.weekly_reviews enable row level security;
create policy "quêtes : catalogue lisible" on public.quests for select to authenticated using (active);
revoke insert, update, delete on public.quests from anon, authenticated;

create policy "mes quêtes : lecture" on public.user_quests for select using (user_id = auth.uid());
create policy "mes quêtes : démarrer" on public.user_quests for insert with check (user_id = auth.uid() and status = 'active' and completed_at is null and evidence is null);
create policy "mes quêtes : progression déclarée" on public.user_quests for update using (user_id = auth.uid() and status = 'active') with check (user_id = auth.uid() and status in ('active', 'abandoned'));
-- La complétion (et donc l'XP) passe uniquement par l'Edge Function validate-quest.
revoke update on public.user_quests from authenticated;
grant update (checked_steps, manual_count, status) on public.user_quests to authenticated;
revoke delete on public.user_quests from authenticated;

create policy "bilans : lecture" on public.weekly_reviews for select using (user_id = auth.uid());
revoke insert, update, delete on public.weekly_reviews from anon, authenticated;

-- Dates de fin calculées côté serveur à partir du catalogue.
create function public.user_quests_defaults() returns trigger language plpgsql security definer set search_path = public as $$
declare d integer;
begin
  select duration_days into d from public.quests where id = new.quest_id and active;
  if d is null then
    raise exception 'Quête inconnue';
  end if;
  new.start_date := current_date;
  new.end_date := current_date + (d - 1);
  return new;
end $$;
create trigger user_quests_defaults before insert on public.user_quests for each row execute function public.user_quests_defaults();

-- ——— Bilan hebdomadaire : une récompense par semaine ISO, semaine calculée par le serveur ———
create function public.complete_weekly_review(p_mood text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk text := to_char(now() at time zone 'utc', 'IYYY-"W"IW');
  inserted integer;
begin
  if me is null then
    raise exception 'Non authentifié';
  end if;
  insert into public.weekly_reviews (user_id, iso_week, mood) values (me, wk, p_mood) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;
  perform public.award_xp(me, 'weekly_review:' || wk, 'weekly_review', 20, 'Bilan hebdomadaire');
  if (select count(*) from public.weekly_reviews where user_id = me) >= 4 then
    perform public.unlock_achievement(me, 'first_month');
  end if;
  return true;
end $$;
revoke execute on function public.complete_weekly_review(text) from public, anon;
grant execute on function public.complete_weekly_review(text) to authenticated;

-- ——— Objectif atteint : récompense unique, avec garde-fous contre les objectifs « jetables » ———
create function public.claim_goal_reward(p_goal uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  g public.savings_goals;
  saved bigint;
  awarded boolean;
begin
  select * into g from public.savings_goals where id = p_goal and user_id = me;
  if g.id is null then
    raise exception 'Objectif introuvable';
  end if;
  if g.target_minor < 1000 or g.created_at > now() - interval '24 hours' then
    return false;
  end if;
  select coalesce(sum(a.amount_minor), 0) into saved from public.goal_allocations a where a.goal_id = p_goal;
  if saved < g.target_minor then
    return false;
  end if;
  awarded := public.award_xp(me, 'goal_reached:' || p_goal, 'goal_reached', 50, 'Objectif atteint : ' || g.name);
  perform public.unlock_achievement(me, 'first_goal');
  return awarded;
end $$;
revoke execute on function public.claim_goal_reward(uuid) from public, anon;
grant execute on function public.claim_goal_reward(uuid) to authenticated;

create trigger manual_transactions_touch before update on public.manual_transactions for each row execute function public.touch_updated_at();
create trigger savings_goals_touch before update on public.savings_goals for each row execute function public.touch_updated_at();
create trigger savings_transactions_touch before update on public.savings_transactions for each row execute function public.touch_updated_at();
create trigger budgets_touch before update on public.budgets for each row execute function public.touch_updated_at();
