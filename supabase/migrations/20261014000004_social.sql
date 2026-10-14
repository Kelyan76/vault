-- VAULT — amis et défis. Seuls pseudo, avatar et scores partagés circulent entre amis.

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('quests_count', 'habit_regularity', 'weekly_review', 'goal_progress', 'collective_habits')),
  title text not null check (char_length(title) between 3 and 60),
  start_date date not null,
  end_date date not null,
  collective_target integer check (collective_target is null or collective_target between 1 and 10000),
  visibility text not null default 'private' check (visibility = 'private'),
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 90)
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Score partagé : nombre d'actions ou pourcentage d'objectif. Jamais un montant.
  shared_score integer not null default 0 check (shared_score between 0 and 1000),
  status text not null default 'invited' check (status in ('invited', 'joined', 'left')),
  joined_at timestamptz,
  score_updated_at timestamptz,
  primary key (challenge_id, user_id)
);

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid references public.challenges (id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.abuse_reports enable row level security;

create function public.are_friends(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  )
$$;

create function public.is_blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create function public.in_challenge(p_challenge uuid, p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenge_participants where challenge_id = p_challenge and user_id = p_user and status <> 'left')
    or exists (select 1 from public.challenges where id = p_challenge and created_by = p_user)
$$;

create policy "amitiés : les miennes" on public.friendships for select using (auth.uid() in (requester_id, addressee_id));
create policy "amitiés : inviter" on public.friendships for insert with check (
  requester_id = auth.uid() and status = 'pending' and not public.is_blocked(requester_id, addressee_id)
);
create policy "amitiés : accepter" on public.friendships for update using (addressee_id = auth.uid() and status = 'pending') with check (addressee_id = auth.uid() and status = 'accepted');
create policy "amitiés : retirer" on public.friendships for delete using (auth.uid() in (requester_id, addressee_id));
revoke update on public.friendships from authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

create policy "blocages : les miens" on public.user_blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "défis : participants" on public.challenges for select using (created_by = auth.uid() or public.in_challenge(id, auth.uid()));
create policy "défis : créer" on public.challenges for insert with check (created_by = auth.uid());
create policy "défis : supprimer le sien" on public.challenges for delete using (created_by = auth.uid());

create policy "participants : visibles des participants" on public.challenge_participants for select using (public.in_challenge(challenge_id, auth.uid()));
create policy "participants : le créateur invite ses amis" on public.challenge_participants for insert with check (
  status = 'invited'
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid())
  and (user_id = auth.uid() or public.are_friends(auth.uid(), user_id))
);
-- Rejoindre ou quitter : seulement sa propre ligne, et seulement le statut (le score est calculé par le serveur).
create policy "participants : rejoindre ou quitter" on public.challenge_participants for update using (user_id = auth.uid()) with check (user_id = auth.uid() and status in ('joined', 'left'));
revoke update on public.challenge_participants from authenticated;
grant update (status, joined_at) on public.challenge_participants to authenticated;

create policy "signalements : créer" on public.abuse_reports for insert with check (reporter_id = auth.uid());
create policy "signalements : les miens" on public.abuse_reports for select using (reporter_id = auth.uid());

-- Profils publics : pseudo et avatar seulement, pour soi, ses amis, ses co-participants et la recherche par pseudo exact.
create function public.public_profiles(p_ids uuid[]) returns table (id uuid, pseudo text, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.pseudo, p.avatar from public.profiles p
  where p.id = any (p_ids)
    and (p.id = auth.uid() or public.are_friends(auth.uid(), p.id)
         or exists (select 1 from public.friendships f where f.status = 'pending' and auth.uid() in (f.requester_id, f.addressee_id) and p.id in (f.requester_id, f.addressee_id))
         or exists (select 1 from public.challenge_participants a join public.challenge_participants b on a.challenge_id = b.challenge_id
                    where a.user_id = auth.uid() and b.user_id = p.id))
$$;
revoke execute on function public.public_profiles(uuid[]) from public, anon;
grant execute on function public.public_profiles(uuid[]) to authenticated;

create function public.find_profile_by_pseudo(p_pseudo text) returns table (id uuid, pseudo text, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.pseudo, p.avatar from public.profiles p
  where auth.uid() is not null and lower(p.pseudo) = lower(trim(p_pseudo)) and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  limit 1
$$;
revoke execute on function public.find_profile_by_pseudo(text) from public, anon;
grant execute on function public.find_profile_by_pseudo(text) to authenticated;

-- Score partagé recalculé par le serveur à partir de données non financières.
create function public.refresh_challenge_score(p_challenge uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.challenges;
  score integer;
  sharing boolean;
begin
  select * into c from public.challenges where id = p_challenge;
  if c.id is null or not exists (select 1 from public.challenge_participants where challenge_id = p_challenge and user_id = me and status = 'joined') then
    raise exception 'Défi introuvable';
  end if;
  select share_in_challenges into sharing from public.profiles where id = me;
  if not sharing then
    score := 0;
  elsif c.type = 'quests_count' then
    select count(*) into score from public.user_quests where user_id = me and status = 'completed' and completed_at::date between c.start_date and c.end_date;
  elsif c.type in ('habit_regularity', 'collective_habits') then
    select count(*) into score from public.habit_completions where user_id = me and completed_on between c.start_date and c.end_date;
  elsif c.type = 'weekly_review' then
    select count(*) into score from public.weekly_reviews where user_id = me and created_at::date between c.start_date and c.end_date;
  else
    -- goal_progress : meilleur pourcentage d'objectif personnel (jamais le montant).
    select coalesce(max(least(100, floor(100.0 * coalesce((select sum(a.amount_minor) from public.goal_allocations a where a.goal_id = g.id), 0) / g.target_minor))), 0)::integer
      into score from public.savings_goals g where g.user_id = me and g.archived_at is null;
  end if;
  update public.challenge_participants set shared_score = least(1000, score), score_updated_at = now() where challenge_id = p_challenge and user_id = me;
  return score;
end $$;
revoke execute on function public.refresh_challenge_score(uuid) from public, anon;
grant execute on function public.refresh_challenge_score(uuid) to authenticated;
