-- Enable Banking comme prestataire possible (usage personnel gratuit en mode restreint).
alter table public.bank_provider_users drop constraint bank_provider_users_provider_check;
alter table public.bank_provider_users add constraint bank_provider_users_provider_check check (provider in ('bridge', 'powens', 'enablebanking'));

alter table public.bank_connections drop constraint bank_connections_provider_check;
alter table public.bank_connections add constraint bank_connections_provider_check check (provider in ('bridge', 'powens', 'enablebanking', 'demo'));

-- Les opérations en attente d'une période sont relues pour la réconciliation : index dédié.
create index bank_transactions_pending_idx on public.bank_transactions (connection_id, booking_date) where status = 'pending' and not removed;
