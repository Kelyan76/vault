import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { CHALLENGE_TYPES, collectiveProgress, leaderboard } from '@shared/domain/challenges.ts';
import { leaveChallenge } from '@/store/actions';
import { useStore } from '@/store/store';
import { Avatar } from '@/art/Avatar';
import { Screen, ErrorState } from '@/ui/layout';
import { Button, Card, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act, today, space: sp } = useStore();
  const c = data.challenges.find((x) => x.id === id);
  if (!c) return <Screen back title="Défi"><ErrorState text="Défi introuvable." /></Screen>;
  const rows = leaderboard(c.participants);
  const meta = CHALLENGE_TYPES[c.type];
  const over = c.endDate < today;
  const me = c.participants.find((p) => p.userId === 'me');

  return (
    <Screen back title={c.title} subtitle={`${meta.title} · du ${shortDate(c.startDate)} au ${shortDate(c.endDate)}`}>
      <Row gap={6}>
        <Pill label="PRIVÉ" color={colors.primary} bg={colors.primarySoft} icon="lock" />
        {sp === 'demo' ? <Pill label="DÉMO · AMIS FICTIFS" color={colors.demo} bg={colors.demoSoft} /> : null}
        {over ? <Pill label="TERMINÉ" color={colors.textMuted} bg={colors.surfaceAlt} /> : null}
      </Row>

      {c.collectiveTarget ? (
        <Card style={{ marginTop: space.md, gap: 8 }} tone={colors.habitSoft}>
          <T v="heading">Objectif commun</T>
          <ProgressBar value={collectiveProgress(c, c.participants)} color={colors.habit} track="#FFFFFF" height={14} label="Progression collective" />
          <T v="small" color={colors.textMuted}>
            {c.participants.filter((p) => !p.left).reduce((s, p) => s + p.sharedScore, 0)} / {c.collectiveTarget} {meta.unit} à plusieurs
          </T>
        </Card>
      ) : null}

      <SectionTitle title={over ? 'Résultats' : 'Classement'} />
      <Card style={{ gap: 12 }}>
        {rows.map((r) => (
          <Row key={r.userId}>
            <T v="heading" style={{ width: 26 }} color={r.rank === 1 ? colors.rewardInk : colors.textMuted}>
              {r.rank}
            </T>
            <Avatar id={r.avatar as never} name={r.pseudo} size={40} ring={r.userId === 'me' ? colors.primary : undefined} />
            <T v="bodyStrong" style={{ flex: 1 }}>
              {r.userId === 'me' ? `${r.pseudo} (toi)` : r.pseudo}
            </T>
            <T v="bodyStrong" color={colors.quest}>
              {r.score} {c.type === 'goal_progress' ? '%' : ''}
            </T>
          </Row>
        ))}
        <T v="small" color={colors.textMuted}>
          Score : {meta.unit}. Seul ce nombre est partagé ; aucun montant, solde ni opération.
        </T>
        {!data.profile.shareInChallenges ? <T v="small" color={colors.rewardInk}>Tu as désactivé le partage de score : tu apparais avec 0.</T> : null}
      </Card>

      {me && !me.left && !over ? (
        <View style={{ marginTop: space.lg }}>
          <Button kind="ghost" label="Quitter le défi" onPress={() => { act((d, env) => leaveChallenge(d, c.id, env)); router.back(); }} />
        </View>
      ) : null}
    </Screen>
  );
}
