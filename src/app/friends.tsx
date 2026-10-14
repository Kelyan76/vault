import { useState } from 'react';
import { View } from 'react-native';
import { acceptFriend, inviteFriend, removeFriend, reportFriend } from '@/store/actions';
import { useStore } from '@/store/store';
import { useAuth } from '@/features/auth/auth';
import { useServerFriends } from '@/features/social/useServerFriends';
import { Avatar } from '@/art/Avatar';
import { Screen, EmptyState, ErrorState, LoadingState, Notice } from '@/ui/layout';
import { Button, Card, Field, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';
import type { Avatar as AvatarId } from '@/store/types';

interface FriendItem {
  key: string;
  pseudo: string;
  avatar: AvatarId;
  status: 'pending_out' | 'pending_in' | 'accepted';
  demo: boolean;
  onAccept: () => void;
  onRemove: () => void;
  onReport: (reason: string) => Promise<string | null> | string | null;
}

function FriendRow({ f }: { f: FriendItem }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  return (
    <Card style={{ gap: 8 }}>
      <Row>
        <Avatar id={f.avatar} size={44} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{f.pseudo}</T>
          <Row gap={6}>
            {f.status === 'accepted' ? <Pill label="AMI" color={colors.success} bg={colors.successSoft} /> : <Pill label={f.status === 'pending_in' ? 'T’INVITE' : 'INVITATION ENVOYÉE'} color={colors.rewardInk} bg={colors.rewardSoft} />}
            {f.demo ? <Pill label="FICTIF" color={colors.demo} bg={colors.demoSoft} /> : null}
          </Row>
        </View>
        {f.status === 'pending_in' ? <Button small label="Accepter" onPress={f.onAccept} /> : null}
      </Row>
      <Row gap={space.md}>
        <Button small kind="ghost" label={f.status === 'accepted' ? 'Retirer' : 'Annuler'} onPress={f.onRemove} />
        <Button small kind="ghost" label="Signaler" onPress={() => setReporting(!reporting)} />
      </Row>
      {reporting ? (
        <View style={{ gap: 8 }}>
          <Field label="Que s’est-il passé ?" value={reason} onChangeText={setReason} multiline maxLength={500} />
          <Button small kind="danger" label="Envoyer le signalement" onPress={async () => { const e = await f.onReport(reason); setNote(e ?? 'Signalement enregistré. Merci.'); if (!e) setReporting(false); }} />
        </View>
      ) : null}
      {note ? <Notice tone="info" text={note} /> : null}
    </Card>
  );
}

export default function Friends() {
  const { data, act, space: sp } = useStore();
  const auth = useAuth();
  const server = sp === 'personal' && auth.configured && !!auth.session;
  const remote = useServerFriends(server, auth.session?.user.id ?? null);
  const [pseudo, setPseudo] = useState('');
  const [msg, setMsg] = useState<{ tone: 'alert' | 'success'; text: string } | null>(null);
  const canInvite = sp === 'demo' || server;

  const items: FriendItem[] = server
    ? remote.friends.map((f) => ({
        key: f.friendshipId,
        pseudo: f.pseudo,
        avatar: f.avatar,
        status: f.status,
        demo: false,
        onAccept: () => remote.accept(f.friendshipId),
        onRemove: () => remote.remove(f.friendshipId),
        onReport: (r) => remote.report(f.userId, r),
      }))
    : data.friends.map((f) => ({
        key: f.id,
        pseudo: f.pseudo,
        avatar: f.avatar,
        status: f.status,
        demo: f.demo,
        onAccept: () => act((d, env) => acceptFriend(d, f.id, env)),
        onRemove: () => act((d, env) => removeFriend(d, f.id, env)),
        onReport: (r) => act((d, env) => reportFriend(d, f.id, r, env)),
      }));

  async function invite() {
    const err = server ? await remote.invite(pseudo) : act((d, env) => inviteFriend(d, pseudo, env));
    setMsg(err ? { tone: 'alert', text: err } : { tone: 'success', text: `Invitation envoyée à ${pseudo}.` });
    if (!err) setPseudo('');
  }

  return (
    <Screen back title="Amis" subtitle="Tes amis voient ton pseudo, ton avatar et les scores que tu partages dans les défis. Jamais tes soldes, opérations, revenus ou objectifs.">
      {canInvite ? (
        <Card style={{ gap: space.sm }}>
          <Field label="Inviter par pseudo exact" value={pseudo} onChangeText={setPseudo} placeholder="ex. Noah_76" autoCapitalize="none" maxLength={20} />
          <Button label="Envoyer l’invitation" icon="users" onPress={invite} />
          {sp === 'demo' ? <T v="small" color={colors.demo}>En démo, les invitations restent fictives.</T> : null}
        </Card>
      ) : (
        <Notice tone="info" text={auth.configured ? 'Crée un compte VAULT pour ajouter de vrais amis.' : 'Les amis nécessitent le serveur VAULT, qui n’est pas configuré dans cette version. Essaie la fonction dans l’espace démo.'} />
      )}
      {msg ? <View style={{ marginTop: space.sm }}><Notice tone={msg.tone} text={msg.text} /></View> : null}

      <SectionTitle title="Ma liste" />
      {server && remote.loading ? <LoadingState /> : null}
      {server && remote.error ? <ErrorState text={remote.error} onRetry={remote.reload} /> : null}
      {items.length === 0 && !(server && remote.loading) ? (
        <EmptyState art="friends" title="Pas encore d’amis ici" text="Invite un proche : vous pourrez lancer des défis de régularité, sans jamais montrer vos chiffres." />
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((f) => (
            <FriendRow key={f.key} f={f} />
          ))}
        </View>
      )}
    </Screen>
  );
}
