-- VAULT — socle : profils, progression, XP, badges, audit.
-- Principe : les tables privées ont RLS ; les tables « officielles » (XP, badges, progression)
-- ne sont modifiables que par des fonctions serveur, jamais directement par le client.

create extension if not exists pgcrypto;

-- ——— Profils (seule partie visible des amis : pseudo + avatar) ———
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null unique check (char_length(pseudo) between 3 and 20 and pseudo ~ '^[[:alnum:]_.-]+$'),
  avatar text not null default 'fox' check (avatar in ('fox', 'owl', 'cat', 'bear', 'panda', 'frog', 'koala', 'tiger')),
  default_currency char(3) not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  notifications jsonb not null default '{"quests": true, "sync": true, "challenges": true, "weekly_review": true}'::jsonb,
  -- Le partage dans les défis est opt-in.
  share_in_challenges boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profil : lecture de soi" on public.profiles for select using (id = auth.uid());
create policy "profil : mise à jour de soi" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from anon, authenticated;

-- ——— Progression officielle ———
create table public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  xp_total integer not null default 0 check (xp_total >= 0),
  level integer not null default 1 check (level >= 1),
  updated_at timestamptz not null default now()
);

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 3 and 200),
  reason text not null check (reason in ('first_bank_connection', 'first_quest', 'quest_completed', 'weekly_review', 'goal_reached', 'habit_streak', 'challenge_completed', 'badge_unlocked')),
  amount integer not null check (amount > 0 and amount <= 500),
  label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index xp_transactions_user_idx on public.xp_transactions (user_id, created_at desc);

create table public.achievements (
  id text primary key,
  title text not null,
  description text not null,
  color text not null
);

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

insert into public.achievements (id, title, description, color) values
  ('first_quest', 'Première quête', 'Terminer une première quête.', 'coral'),
  ('first_week', 'Première semaine', 'Utiliser VAULT 7 jours différents.', 'turquoise'),
  ('first_goal', 'Objectif atteint', 'Mener un objectif d’épargne au bout.', 'green'),
  ('first_streak', 'Première série', 'Tenir une habitude 3 fois d’affilée.', 'violet'),
  ('first_challenge', 'Esprit d’équipe', 'Terminer un premier défi entre amis.', 'gold'),
  ('first_month', 'Premier mois', 'Faire 4 bilans hebdomadaires.', 'violet'),
  ('first_avoided', 'Bien vu', 'Déclarer une première dépense évitée.', 'coral');

alter table public.user_progress enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

create policy "progression : lecture de soi" on public.user_progress for select using (user_id = auth.uid());
create policy "xp : lecture de soi" on public.xp_transactions for select using (user_id = auth.uid());
create policy "badges : catalogue lisible" on public.achievements for select to authenticated using (true);
create policy "badges : lecture de soi" on public.user_achievements for select using (user_id = auth.uid());

revoke insert, update, delete on public.user_progress, public.xp_transactions, public.achievements, public.user_achievements from anon, authenticated;

-- ——— Piste d'audit (aucune donnée financière détaillée) ———
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc);
alter table public.audit_log enable row level security;
create policy "audit : lecture de soi" on public.audit_log for select using (user_id = auth.uid());
revoke insert, update, delete on public.audit_log from anon, authenticated;

create function public.audit(p_user uuid, p_action text, p_target text default null, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (user_id, action, target, metadata) values (p_user, p_action, p_target, p_meta);
$$;
revoke execute on function public.audit(uuid, text, text, jsonb) from public, anon, authenticated;

-- ——— Niveaux : mêmes seuils que supabase/functions/_shared/domain/xp.ts ———
create function public.level_for_xp(p_xp integer) returns integer language plpgsql immutable as $$
declare lvl integer := 1;
begin
  while p_xp >= 25 * lvl * (lvl + 3) loop -- xpForLevel(lvl + 1) = 25 * lvl * (lvl + 3)
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

-- ——— Attribution d'XP : idempotente, réservée au serveur ———
create function public.award_xp(p_user uuid, p_key text, p_reason text, p_amount integer, p_label text)
returns boolean language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
  insert into public.xp_transactions (user_id, idempotency_key, reason, amount, label)
  values (p_user, p_key, p_reason, p_amount, p_label)
  on conflict (user_id, idempotency_key) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;
  insert into public.user_progress (user_id, xp_total, level) values (p_user, p_amount, public.level_for_xp(p_amount))
  on conflict (user_id) do update
    set xp_total = public.user_progress.xp_total + p_amount,
        level = public.level_for_xp(public.user_progress.xp_total + p_amount),
        updated_at = now();
  return true;
end $$;
revoke execute on function public.award_xp(uuid, text, text, integer, text) from public, anon, authenticated;

create function public.unlock_achievement(p_user uuid, p_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
  insert into public.user_achievements (user_id, achievement_id) values (p_user, p_id) on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end $$;
revoke execute on function public.unlock_achievement(uuid, text) from public, anon, authenticated;

-- ——— Création automatique du profil ———
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data ->> 'pseudo', '');
  final text;
begin
  if wanted ~ '^[[:alnum:]_.-]{3,20}$' and not exists (select 1 from public.profiles where pseudo = wanted) then
    final := wanted;
  else
    final := 'joueur_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, pseudo) values (new.id, final);
  insert into public.user_progress (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
