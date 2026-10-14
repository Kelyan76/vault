import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { questById } from '@shared/domain/quests.ts';
import { isoWeekKey } from '@shared/domain/dates.ts';
import { vaultStage } from '@shared/domain/savings.ts';
import { STATUS_COPY } from '@shared/banking/status.ts';
import { toggleHabit } from '@/store/actions';
import { useGoals, useQuestEvaluations, useSpending, useStreaks } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useBank } from '@/features/bank/useBank';
import { PlayerCard } from '@/features/home/PlayerCard';
import { Chest } from '@/art/Chest';
import { Avatar } from '@/art/Avatar';
import { Screen } from '@/ui/layout';
import { Icon, IconBubble } from '@/ui/Icon';
import { Button, Card, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { Donut } from '@/ui/charts';
import { categoryMeta } from '@/ui/categories';
import { money, monthName, relativeTime } from '@/ui/format';
import { colors, radius, space } from '@/theme/tokens';

function greeting(): string {
  const h = new Date().getHours();
  return h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

function BankCard() {
  const bank = useBank();
  const live = bank.connections.filter((c) => !c.disconnectedAt);
  if (live.length === 0) {
    return (
      <Card style={{ gap: space.sm }}>
        <Row>
          <IconBubble name="bank" color={colors.habit} bg={colors.habitSoft} />
          <View style={{ flex: 1 }}>
            <T v="heading">Suivre tes dépenses</T>
            <T v="small" color={colors.textMuted}>
              Connecte ta banque ou commence en saisissant tes dépenses à la main.
            </T>
          </View>
        </Row>
        <Row>
          <Button small label="Connecter ma banque" icon="bank" onPress={() => router.push('/bank')} style={{ flex: 1 }} />
          <Button small kind="secondary" label="Mode manuel" icon="plus" onPress={() => router.push('/transactions/new')} style={{ flex: 1 }} />
        </Row>
      </Card>
    );
  }
  const c = live[0];
  const copy = STATUS_COPY[c.status];
  const accounts = bank.accounts.filter((a) => a.connectionId === c.id);
  return (
    <Card onPress={() => router.push('/bank/connections')} accessibilityLabel="Gérer mes connexions bancaires">
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <IconBubble name="bank" color={colors.habit} bg={colors.habitSoft} />
          <View>
            <T v="bodyStrong">{c.institution}</T>
            <T v="small" color={colors.textMuted}>
              Synchronisé {relativeTime(c.lastSyncAt)}
            </T>
          </View>
        </Row>
        {c.demo ? <Pill label="DÉMO" color={colors.demo} bg={colors.demoSoft} /> : <Pill label={copy.title.toUpperCase()} color={copy.tone === 'success' ? colors.success : colors.rewardInk} bg={copy.tone === 'success' ? colors.successSoft : colors.rewardSoft} />}
      </Row>
      <View style={{ marginTop: space.sm, gap: 6 }}>
        {accounts.slice(0, 3).map((a) => (
          <Row key={a.id} style={{ justifyContent: 'space-between' }}>
            <T v="small" color={colors.textMuted}>
              {a.name}
            </T>
            <T v="bodyStrong">{a.balanceMinor !== null && a.currency ? money(a.balanceMinor, a.currency) : 'Solde indisponible'}</T>
          </Row>
        ))}
      </View>
      <T v="small" color={colors.textMuted} style={{ marginTop: space.xs }}>
        {c.demo ? 'Soldes fictifs de la banque démo.' : 'Solde communiqué par ta banque lors de la dernière synchronisation (pas en temps réel).'}
      </T>
    </Card>
  );
}

function SpendingCard() {
  const { data, today } = useStore();
  const s = useSpending('month');
  const top = s.current.byCategory.slice(0, 4);
  const cur = data.profile.currency;
  const diff = s.previousToDate.totalSpentMinor > 0 ? Math.round(((s.current.totalSpentMinor - s.previousToDate.totalSpentMinor) / s.previousToDate.totalSpentMinor) * 100) : null;
  if (s.current.transactionCount === 0) {
    return (
      <Card>
        <T v="heading">Dépenses de {monthName(today)}</T>
        <T color={colors.textMuted} style={{ marginTop: 4 }}>
          Aucune opération pour l’instant ce mois-ci.
        </T>
      </Card>
    );
  }
  return (
    <Card onPress={() => router.push('/(tabs)/budget')} accessibilityLabel="Voir le budget">
      <Row style={{ alignItems: 'flex-start', gap: space.md }}>
        <Donut size={112} thickness={16} parts={top.map((c) => ({ key: c.category, value: c.spentMinor, color: categoryMeta(c.category).color }))} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="small" color={colors.textMuted}>
            Dépensé en {monthName(today)}
          </T>
          <T v="number">{money(s.current.totalSpentMinor, cur)}</T>
          {diff !== null ? (
            <Row gap={4}>
              <Icon name={diff > 0 ? 'arrowUp' : 'arrowDown'} size={14} color={diff > 0 ? colors.quest : colors.success} />
              <T v="small" color={colors.textMuted}>
                {Math.abs(diff)} % vs même période le mois dernier
              </T>
            </Row>
          ) : null}
          {top.slice(0, 3).map((c) => (
            <Row key={c.category} gap={6}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: categoryMeta(c.category).color }} />
              <T v="small" style={{ flex: 1 }} numberOfLines={1}>
                {categoryMeta(c.category).label}
              </T>
              <T v="small" color={colors.textMuted}>
                {money(c.spentMinor, cur)}
              </T>
            </Row>
          ))}
        </View>
      </Row>
      {s.current.pendingMinor > 0 ? (
        <T v="small" color={colors.textMuted} style={{ marginTop: space.xs }}>
          + {money(s.current.pendingMinor, cur)} en attente, non comptés.
        </T>
      ) : null}
    </Card>
  );
}

export default function Home() {
  const { data, today, act } = useStore();
  const evals = useQuestEvaluations();
  const goals = useGoals();
  const streaks = useStreaks();
  const active = data.userQuests.filter((q) => q.status === 'active');
  const reviewDone = data.weeklyReviews.some((w) => isoWeekKey(w.date) === isoWeekKey(today));
  const myChallenges = data.challenges.filter((c) => c.endDate >= today && c.participants.some((p) => p.userId === 'me' && !p.left));

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <View>
          <T color={colors.textMuted}>{greeting()},</T>
          <T v="title">{data.profile.pseudo}</T>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/profile')} accessibilityLabel="Profil">
          <Avatar id={data.profile.avatar} size={46} />
        </Pressable>
      </Row>

      <PlayerCard />

      {!reviewDone ? (
        <Card tone={colors.rewardSoft} style={{ marginTop: space.md }} onPress={() => router.push('/review')} accessibilityLabel="Faire mon bilan de la semaine">
          <Row>
            <IconBubble name="receipt" color={colors.rewardInk} bg="#FFE7AE" />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Bilan de la semaine</T>
              <T v="small" color={colors.textMuted}>
                2 minutes pour faire le point · +20 XP
              </T>
            </View>
            <Icon name="right" color={colors.rewardInk} />
          </Row>
        </Card>
      ) : null}

      <SectionTitle title="Mes comptes" action="Gérer" onAction={() => router.push('/bank/connections')} />
      <BankCard />

      <SectionTitle title="Dépenses" action="Détails" onAction={() => router.push('/stats')} />
      <SpendingCard />

      <SectionTitle title="Quêtes en cours" action="Toutes" onAction={() => router.push('/(tabs)/quests')} />
      {active.length === 0 ? (
        <Card onPress={() => router.push('/(tabs)/quests')}>
          <Row>
            <IconBubble name="flag" color={colors.quest} bg={colors.questSoft} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Choisis ta première quête</T>
              <T v="small" color={colors.textMuted}>
                De petites missions, de vrais progrès.
              </T>
            </View>
            <Icon name="right" color={colors.quest} />
          </Row>
        </Card>
      ) : (
        <View style={{ gap: space.sm }}>
          {active.slice(0, 3).map((q) => {
            const def = questById(q.questId);
            const ev = evals.get(q.id);
            if (!def || !ev) return null;
            return (
              <Card key={q.id} onPress={() => router.push(`/quest/${q.id}`)} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {def.title}
                  </T>
                  <Pill label={ev.state === 'ready' ? 'À VALIDER' : `+${def.xp} XP`} color={ev.state === 'ready' ? colors.success : colors.quest} bg={ev.state === 'ready' ? colors.successSoft : colors.questSoft} />
                </Row>
                <ProgressBar value={ev.progress} color={colors.quest} track={colors.questSoft} label={def.title} />
                <T v="small" color={colors.textMuted}>
                  {ev.detail}
                </T>
              </Card>
            );
          })}
        </View>
      )}

      <SectionTitle title="Habitudes du jour" action="Toutes" onAction={() => router.push('/habits')} />
      <Card style={{ gap: space.sm }}>
        {data.habits
          .filter((h) => !h.archivedAt)
          .slice(0, 4)
          .map((h) => {
            const s = streaks.get(h.id);
            const done = s?.doneInCurrentSlot ?? false;
            return (
              <Pressable
                key={h.id}
                onPress={() => act((d, env) => toggleHabit(d, h.id, today, env))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={h.name}
                style={styles.habit}
              >
                <View style={[styles.check, done && { backgroundColor: colors.habit, borderColor: colors.habit }]}>{done ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{h.name}</T>
                  <T v="small" color={colors.textMuted}>
                    {h.frequency === 'daily' ? 'Chaque jour' : 'Chaque semaine'}
                    {s && s.current > 0 ? ` · série de ${s.current}` : ''}
                  </T>
                </View>
                {s && s.current >= 3 ? <Icon name="flame" size={18} color={colors.quest} /> : null}
              </Pressable>
            );
          })}
      </Card>

      <SectionTitle title="Mon coffre" action="Ouvrir" onAction={() => router.push('/(tabs)/vault')} />
      <Card onPress={() => router.push('/(tabs)/vault')}>
        <Row style={{ gap: space.md }}>
          <Chest stage={vaultStage(goals)} size={0.5} />
          <View style={{ flex: 1, gap: 8 }}>
            {goals.length === 0 ? (
              <T color={colors.textMuted}>Crée un objectif pour remplir ton coffre.</T>
            ) : (
              goals.slice(0, 2).map((g) => (
                <View key={g.goal.id} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T v="small" style={{ flex: 1 }} numberOfLines={1}>
                      {g.goal.name}
                    </T>
                    <T v="small" color={colors.textMuted}>
                      {Math.round(g.ratio * 100)} %
                    </T>
                  </Row>
                  <ProgressBar value={g.ratio} color={colors.habit} track={colors.habitSoft} height={8} label={g.goal.name} />
                </View>
              ))
            )}
          </View>
        </Row>
      </Card>

      <SectionTitle title="Défis entre amis" action="Voir" onAction={() => router.push('/challenges')} />
      {myChallenges.length === 0 ? (
        <Card onPress={() => router.push('/challenges')}>
          <T color={colors.textMuted}>Aucun défi en cours. Lance-en un avec tes amis : seuls vos scores sont partagés.</T>
        </Card>
      ) : (
        myChallenges.slice(0, 2).map((c) => {
          const sorted = [...c.participants].filter((p) => !p.left).sort((a, b) => b.sharedScore - a.sharedScore);
          const rank = sorted.findIndex((p) => p.userId === 'me') + 1;
          return (
            <Card key={c.id} style={{ marginBottom: space.sm }} onPress={() => router.push(`/challenges/${c.id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{c.title}</T>
                  <T v="small" color={colors.textMuted}>
                    {c.collectiveTarget ? 'Objectif commun' : `Tu es ${rank === 1 ? '1er' : `${rank}e`} sur ${sorted.length}`}
                  </T>
                </View>
                <Row gap={-10}>
                  {sorted.slice(0, 3).map((p) => (
                    <View key={p.userId} style={{ marginLeft: -10 }}>
                      <Avatar id={p.avatar as never} size={32} />
                    </View>
                  ))}
                </Row>
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  habit: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
  check: { width: 28, height: 28, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  _r: { borderRadius: radius.md },
});
