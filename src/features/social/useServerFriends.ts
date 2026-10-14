import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Avatar } from '@/store/types';

export interface ServerFriend {
  friendshipId: string;
  userId: string;
  pseudo: string;
  avatar: Avatar;
  status: 'pending_out' | 'pending_in' | 'accepted';
}

/** Amis réels (compte VAULT) : seules les fonctions publiques pseudo/avatar sont utilisées. */
export function useServerFriends(enabled: boolean, myId: string | null) {
  const [friends, setFriends] = useState<ServerFriend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    if (!enabled || !sb || !myId) return;
    setLoading(true);
    setError(null);
    const { data: rows, error: e1 } = await sb.from('friendships').select('id, requester_id, addressee_id, status');
    if (e1) {
      setLoading(false);
      return setError('Impossible de charger tes amis.');
    }
    const others = (rows ?? []).map((r) => (r.requester_id === myId ? r.addressee_id : r.requester_id));
    const { data: profiles } = await sb.rpc('public_profiles', { p_ids: others });
    type PublicProfile = { id: string; pseudo: string; avatar: Avatar };
    const byId = new Map<string, PublicProfile>(((profiles ?? []) as PublicProfile[]).map((p) => [p.id, p]));
    setFriends(
      (rows ?? []).map((r) => {
        const other = r.requester_id === myId ? r.addressee_id : r.requester_id;
        const p = byId.get(other);
        return {
          friendshipId: r.id,
          userId: other,
          pseudo: p?.pseudo ?? 'Joueur',
          avatar: p?.avatar ?? 'fox',
          status: r.status === 'accepted' ? 'accepted' : r.requester_id === myId ? 'pending_out' : 'pending_in',
        };
      }),
    );
    setLoading(false);
  }, [enabled, myId]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = useCallback(
    async (pseudo: string): Promise<string | null> => {
      const sb = supabase();
      if (!sb) return 'Serveur non configuré.';
      const { data } = await sb.rpc('find_profile_by_pseudo', { p_pseudo: pseudo });
      const target = (data as { id: string }[] | null)?.[0];
      // Message volontairement identique : on ne révèle pas si un pseudo existe.
      if (!target) return 'Invitation impossible. Vérifie le pseudo exact.';
      const { error } = await sb.from('friendships').insert({ addressee_id: target.id });
      if (error) return 'Invitation impossible. Vérifie le pseudo exact.';
      await load();
      return null;
    },
    [load],
  );

  const accept = useCallback(
    async (friendshipId: string) => {
      await supabase()?.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', friendshipId);
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (friendshipId: string) => {
      await supabase()?.from('friendships').delete().eq('id', friendshipId);
      await load();
    },
    [load],
  );

  const report = useCallback(async (userId: string, reason: string) => {
    const { error } = (await supabase()?.from('abuse_reports').insert({ reported_id: userId, reason })) ?? { error: null };
    return error ? 'Signalement impossible pour le moment.' : null;
  }, []);

  return { friends, loading, error, reload: load, invite, accept, remove, report };
}
