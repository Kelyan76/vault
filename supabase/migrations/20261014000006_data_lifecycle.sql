-- VAULT — cycle de vie des données : déconnexion bancaire, suppression des données importées, suppression du compte.
-- Ces fonctions sont appelées par les Edge Functions après la révocation chez le prestataire.

-- Marque une connexion comme déconnectée. Si p_delete_data, supprime comptes et opérations importés
-- (les corrections de catégorie partent en cascade ; les mises de côté du coffre restent, détachées de l'opération).
create function public.finalize_bank_disconnection(p_connection uuid, p_delete_data boolean) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.bank_connections where id = p_connection;
  if owner is null then
    return;
  end if;
  if p_delete_data then
    delete from public.bank_transactions where connection_id = p_connection;
    delete from public.bank_accounts where connection_id = p_connection;
  end if;
  update public.bank_connections
    set status = 'disconnected', disconnected_at = coalesce(disconnected_at, now()), sync_cursor = null
    where id = p_connection;
  update public.sync_jobs set status = 'skipped', finished_at = now() where connection_id = p_connection and status in ('queued', 'running');
  perform public.audit(owner, case when p_delete_data then 'bank.disconnect_and_delete' else 'bank.disconnect' end, p_connection::text);
end $$;
revoke execute on function public.finalize_bank_disconnection(uuid, boolean) from public, anon, authenticated;

-- Résumé de ce qui sera supprimé, affiché avant la suppression du compte (aucun montant).
create function public.my_data_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bank_connections', (select count(*) from public.bank_connections where user_id = auth.uid() and disconnected_at is null),
    'bank_transactions', (select count(*) from public.bank_transactions where user_id = auth.uid()),
    'manual_transactions', (select count(*) from public.manual_transactions where user_id = auth.uid()),
    'goals', (select count(*) from public.savings_goals where user_id = auth.uid()),
    'quests', (select count(*) from public.user_quests where user_id = auth.uid()),
    'challenges', (select count(*) from public.challenge_participants where user_id = auth.uid())
  )
$$;
revoke execute on function public.my_data_summary() from public, anon;
grant execute on function public.my_data_summary() to authenticated;
