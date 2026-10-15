import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CHALLENGE_TYPES, type ChallengeType } from '@shared/domain/challenges.ts';
import { createChallenge, refreshMyScores } from '@/store/actions';
import { useStore } from '@/store/store';
import { useAuth } from '@/features/auth/auth';
import { Avatar } from '@/art/Avatar';
import { Screen, EmptyState, Notice } from '@/ui/layout';
import { Button, Card, Chip, Field, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function Challenges() {
  const { data, act, today, space: sp } = useStore();
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<ChallengeType>('quests_count');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(14);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const friends = data.friends.filter((f) => f.status === 'accepted');
  const mine = data.challenges.filter((c) => c.participants.some((p) => p.userId === 'me' && !p.left));
  const active = mine.filter((c) => c.endDate >= today);
  const past = mine.filter((c) => c.endDate < today);

  // Mon score partagé est recalculé à l'ouverture, à partir de données non financières.
  useEffect(() => {
    act((d, env) => refreshMyScores(d, env));
  }, [act]);

  const serverOnly = sp === 'personal';

  return (
    <Screen back title="Défis" subtitle="Privés, entre amis. Classés par actions réalisées, jamais par argent.">
      {serverOnly ? (
        <Notice
          tone="info"
          text={
            auth.configured
              ? 'Les défis avec tes vrais amis arrivent dans la phase « communauté » : les tables et règles serveur sont prêtes, l’écran le sera bientôt. Essaie le fonctionnement dans l’espace démo.'
              : 'Les défis entre amis nécessitent le serveur VAULT, non configuré dans cette version. Essaie-les dans l’espace démo.'
          }
        />
      ) : null}

      {!serverOnly ? (
        creating ? (
          <Card style={{ gap: space.sm }}>
            <T v="heading">Nouveau défi</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {(Object.keys(CHALLENGE_TYPES) as ChallengeType[]).map((t) => (
                <Chip key={t} label={CHALLENGE_TYPES[t].title} selected={type === t} onPress={() => setType(t)} color={colors.quest} />
              ))}
            </Row>
            <T v="small" color={colors.textMuted}>
              Score partagé : {CHALLENGE_TYPES[type].unit}.
            </T>
            <Field label="Titre" value={title} onChangeText={setTitle} placeholder="ex. Novembre régulier" maxLength={60} />
            <Row gap={8}>
              {[7, 14, 30].map((n) => (
                <Chip key={n} label={`${n} jours`} selected={days === n} onPress={() => setDays(n)} color={colors.quest} />
              ))}
            </Row>
            <T v="small" color={colors.textMuted}>
              Avec qui ?
            </T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {friends.map((f) => (
                <Chip key={f.id} label={f.pseudo} selected={picked.includes(f.id)} onPress={() => setPicked(picked.includes(f.id) ? picked.filter((x) => x !== f.id) : [...picked, f.id])} color={colors.quest} />
              ))}
              {friends.length === 0 ? <T v="small" color={colors.textMuted}>Ajoute d’abord des amis.</T> : null}
            </Row>
            {msg ? <Notice tone="alert" text={msg} /> : null}
            <Row>
              <Button kind="secondary" label="Annuler" onPress={() => setCreating(false)} style={{ flex: 1 }} />
              <Button
                label="Lancer"
                style={{ flex: 1 }}
                onPress={() => {
                  const err = act((d, env) => createChallenge(d, { type, title, days, friendIds: picked }, env));
                  setMsg(err);
                  if (!err) {
                    setCreating(false);
                    setTitle('');
                    setPicked([]);
                  }
                }}
              />
            </Row>
          </Card>
        ) : (
          <Button label="Créer un défi" icon="plus" onPress={() => setCreating(true)} />
        )
      ) : null}

      <SectionTitle title="En cours" />
      {active.length === 0 ? (
        <EmptyState art="friends" title="Aucun défi en cours" text="Un défi motive à plusieurs : nombre de quêtes, régularité des habitudes, bilans hebdomadaires…" />
      ) : (
        <View style={{ gap: space.sm }}>
          {active.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/challenges/${c.id}`)} style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {c.title}
                </T>
                {sp === 'demo' ? <Pill label="DÉMO" color={colors.demo} bg={colors.demoSoft} /> : null}
              </Row>
              <T v="small" color={colors.textMuted}>
                {CHALLENGE_TYPES[c.type].title} · jusqu’au {shortDate(c.endDate)}
              </T>
              <Row gap={4}>
                {c.participants.filter((p) => !p.left).map((p) => (
                  <Avatar key={p.userId} id={p.avatar as never} name={p.pseudo} size={30} />
                ))}
              </Row>
            </Card>
          ))}
        </View>
      )}
      {past.length ? (
        <>
          <SectionTitle title="Terminés" />
          {past.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/challenges/${c.id}`)} style={{ marginBottom: space.sm }}>
              <T v="bodyStrong">{c.title}</T>
              <T v="small" color={colors.textMuted}>
                Terminé le {shortDate(c.endDate)} · voir le récapitulatif
              </T>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
