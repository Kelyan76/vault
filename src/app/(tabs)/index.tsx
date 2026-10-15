import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { questById } from '@shared/domain/quests.ts';
import { addDays, isoWeekKey } from '@shared/domain/dates.ts';
import { levelTitle } from '@shared/domain/xp.ts';
import { STATUS_COPY } from '@shared/banking/status.ts';
import { REVIEW_HABIT_ID } from '@shared/domain/quests.ts';
import { toggleHabit } from '@/store/actions';
import { useGoals, useProgress, useProjection, useQuestEvaluations, useSpending, useStreaks } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useBank } from '@/features/bank/useBank';
import { Avatar } from '@/art/Avatar';
import { LogoMark } from '@/art/Logo';
import { Screen } from '@/ui/layout';
import { Icon, type IconName } from '@/ui/Icon';
import { Button, Card, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { Bubbles, Ring } from '@/ui/charts';
import { categoryMeta } from '@/ui/categories';
import { money, relativeTime, shortDate, weekday } from '@/ui/format';
import { colors, fonts, radius, space } from '@/theme/tokens';

const ACTIONS: { label: string; icon: IconName; color: string; href: Href }[] = [
  { label: 'Objectif', icon: 'target', color: colors.habit, href: '/goals/new' },
  { label: 'Dépense', icon: 'receipt', color: colors.challenge, href: '/transactions/new' },
  { label: 'Prévisions', icon: 'chart', color: colors.reward, href: '/forecast' },
  { label: 'Défis', icon: 'flag', color: colors.quest, href: '/challenges' },
];

function Header() {
  const { data } = useStore();
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
      <Row gap={10}>
        <LogoMark size={30} />
        <T v="hero" style={{ fontSize: 30 }}>
          Vault
        </T>
      </Row>
      <Pressable onPress={() => router.push('/(tabs)/profile')} accessibilityLabel="Profil">
        <Avatar id={data.profile.avatar} name={data.profile.pseudo} size={46} ring={colors.reward} />
        {data.achievements.length ? (
          <View style={styles.badgeCount}>
            <T v="tiny" color={colors.onColor}>
              {data.achievements.length}
            </T>
          </View>
        ) : null}
      </Pressable>
    </Row>
  );
}

function HeroCard() {
  const { data, today } = useStore();
  const p = useProjection();
  const cur = data.profile.currency;
  if (!p) {
    // Pas de solde bancaire : on invite à connecter la banque, sans afficher de solde inventé.
    return (
      <Pressable onPress={() => router.push('/bank')} accessibilityRole="button" accessibilityLabel="Connecter ma banque" style={styles.hero}>
        <View style={{ flex: 1, gap: 6 }}>
          <T v="heading" color={colors.onColor}>
            Solde actuel
          </T>
          <T v="title" color={colors.onColor}>
            Connecte ta banque
          </T>
          <T v="small" color={colors.onColor}>
            Pour voir ton solde et ce qu’il te restera à la fin du mois.
          </T>
        </View>
      </Pressable>
    );
  }
  const diff = p.projectedMinor - p.balanceMinor;
  const negative = p.projectedMinor < 0;
  return (
    <Pressable onPress={() => router.push('/forecast')} accessibilityRole="button" accessibilityLabel={`Solde actuel ${money(p.balanceMinor, cur)}, prévu fin du mois ${money(p.projectedMinor, cur)}`} style={styles.hero}>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="heading" color={colors.onColor}>
          Solde actuel
        </T>
        <T v="numberXL" color={colors.onColor} numberOfLines={1} style={{ fontSize: 36, lineHeight: 44 }}>
          {money(p.balanceMinor, cur)}
        </T>
        <View style={styles.projection}>
          <View style={{ flex: 1 }}>
            <T v="tiny" color={colors.textMuted}>
              FIN DU MOIS · {shortDate(p.endOfMonth).toUpperCase()}
            </T>
            <T v="number" color={negative ? colors.alert : colors.primary} style={{ fontSize: 24, lineHeight: 30 }} numberOfLines={1}>
              {money(p.projectedMinor, cur)}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T v="tiny" color={diff < 0 ? colors.quest : colors.primary}>
              {diff < 0 ? '▼' : '▲'} {money(Math.abs(diff), cur)}
            </T>
            <T v="tiny" color={colors.textMuted}>
              {p.daysLeft > 0 ? `encore ${p.daysLeft} j` : 'dernier jour'}
            </T>
          </View>
        </View>
        <T v="tiny" color={colors.onColor} style={{ opacity: 0.75 }}>
          AU {shortDate(today).toUpperCase()} · {p.referenceMonths ? 'ESTIMATION SUR TES MOIS PRÉCÉDENTS' : 'HISTORIQUE TROP COURT, ESTIMATION PARTIELLE'}
        </T>
      </View>
    </Pressable>
  );
}

function ActionRow() {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
      {ACTIONS.map((a) => (
        <Pressable key={a.label} onPress={() => router.push(a.href)} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [{ alignItems: 'center', gap: 8, flex: 1 }, pressed && { transform: [{ scale: 0.94 }] }]}>
          <View style={[styles.actionCircle, { backgroundColor: a.color }]}>
            <Icon name={a.icon} size={30} color={colors.onColor} strokeWidth={2.4} />
          </View>
          <T v="tiny" style={{ fontFamily: fonts.displaySemi, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.3 }}>
            {a.label}
          </T>
        </Pressable>
      ))}
    </Row>
  );
}

function Tiles() {
  const { data } = useStore();
  const goals = useGoals();
  const s = useSpending('month');
  const cur = data.profile.currency;
  const saved = goals.reduce((n, g) => n + g.savedMinor, 0);
  const target = goals.reduce((n, g) => n + g.goal.targetMinor, 0);
  const ratio = target ? Math.min(1, saved / target) : 0;
  const diff = s.previousToDate.totalSpentMinor > 0 ? Math.round(((s.current.totalSpentMinor - s.previousToDate.totalSpentMinor) / s.previousToDate.totalSpentMinor) * 100) : null;
  return (
    <Row style={{ marginTop: space.lg, alignItems: 'stretch' }} gap={space.sm}>
      <Card style={styles.tile} onPress={() => router.push('/(tabs)/vault')} accessibilityLabel="Objectifs">
        <T v="heading">Objectifs</T>
        <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: space.sm }}>
          <Ring value={ratio} size={112} thickness={12} color={colors.primary} track={colors.cardHigh} />
          <T v="number" style={{ position: 'absolute' }}>
            {Math.round(ratio * 100)}%
          </T>
        </View>
        <T v="tiny" color={colors.textMuted}>
          ÉPARGNÉ
        </T>
        <T v="small" style={{ fontFamily: fonts.mono }} numberOfLines={2}>
          {money(saved, cur)}
          <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.mono }}>
            {target ? ` / ${money(target, cur)}` : ''}
          </T>
        </T>
      </Card>
      <Card style={styles.tile} onPress={() => router.push('/(tabs)/budget')} accessibilityLabel="Dépenses du mois">
        <T v="heading">Dépenses</T>
        <View style={{ alignItems: 'center', marginVertical: space.xs }}>
          {s.current.byCategory.length ? (
            <Bubbles size={128} parts={s.current.byCategory.map((c) => ({ key: c.category, value: c.spentMinor, color: categoryMeta(c.category).color, label: categoryMeta(c.category).label }))} />
          ) : (
            <View style={{ height: 128, justifyContent: 'center' }}>
              <T v="small" color={colors.textMuted} center>
                Aucune dépense ce mois-ci
              </T>
            </View>
          )}
        </View>
        <T v="tiny" color={colors.textMuted}>
          CE MOIS
        </T>
        <Row gap={6}>
          <T v="small" style={{ fontFamily: fonts.mono }}>
            {money(s.current.totalSpentMinor, cur)}
          </T>
          {diff !== null ? (
            <T v="tiny" color={diff > 0 ? colors.alert : colors.success}>
              {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}%
            </T>
          ) : null}
        </Row>
      </Card>
    </Row>
  );
}

function LevelCard() {
  const lvl = useProgress();
  const dots = 10;
  const filled = Math.round(lvl.progress * dots);
  return (
    <Pressable onPress={() => router.push('/badges')} accessibilityRole="button" accessibilityLabel={`Niveau ${lvl.level}`} style={styles.level}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="heading" color={colors.onColor}>
          Niveau {lvl.level}
        </T>
        <T v="tiny" color={colors.onColor}>
          {lvl.xp - lvl.levelStartXp} / {lvl.nextLevelXp - lvl.levelStartXp} XP
        </T>
      </Row>
      <T v="title" color={colors.challenge} style={{ fontSize: 26, marginVertical: 6 }}>
        {levelTitle(lvl.level)}
      </T>
      <Row gap={6}>
        {Array.from({ length: dots }, (_, i) => (
          <View key={i} style={[styles.dot, i < filled ? { backgroundColor: colors.onColor } : { backgroundColor: 'rgba(13,16,11,0.18)' }]} />
        ))}
      </Row>
    </Pressable>
  );
}

function StreakCard() {
  const { data, today, act } = useStore();
  const streaks = useStreaks();
  const s = streaks.get(REVIEW_HABIT_ID);
  if (!data.habits.some((h) => h.id === REVIEW_HABIT_ID && !h.archivedAt)) return null;
  const days = [-4, -3, -2, -1, 0].map((n) => addDays(today, n));
  return (
    <Card style={{ marginTop: space.md, gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Icon name="flame" size={20} color={colors.quest} />
          <T v="heading">Série de {s?.current ?? 0} jours</T>
        </Row>
        {!s?.doneInCurrentSlot ? <Button small label="Valider" onPress={() => act((d, env) => toggleHabit(d, REVIEW_HABIT_ID, today, env))} /> : <Pill label="FAIT" color={colors.onColor} bg={colors.primary} />}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        {days.map((d) => {
          const done = data.habitCompletions.some((c) => c.habitId === REVIEW_HABIT_ID && c.date === d);
          return (
            <View key={d} style={[styles.streakDay, done ? { borderColor: colors.primary, backgroundColor: colors.primarySoft } : { borderColor: colors.border }]}>
              <Icon name="flame" size={16} color={done ? colors.reward : colors.textMuted} />
              <T v="tiny" color={done ? colors.text : colors.textMuted}>
                {weekday(d).toUpperCase().slice(0, 3)}
              </T>
            </View>
          );
        })}
      </Row>
      <T v="small" color={colors.textMuted} center>
        Habitude « Vérifier mon budget ». Un jour manqué ? Ta série repart quand tu veux.
      </T>
    </Card>
  );
}

function BankCard() {
  const bank = useBank();
  const live = bank.connections.filter((c) => !c.disconnectedAt);
  if (live.length === 0) {
    return (
      <Card style={{ gap: space.sm }}>
        <T color={colors.textMuted}>Connecte ta banque pour suivre tes dépenses automatiquement, ou saisis-les à la main.</T>
        <Row>
          <Button small label="Connecter" icon="bank" onPress={() => router.push('/bank')} style={{ flex: 1 }} />
          <Button small kind="secondary" label="Saisir" icon="plus" onPress={() => router.push('/transactions/new')} style={{ flex: 1 }} />
        </Row>
      </Card>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      {live.map((c) => {
        const copy = STATUS_COPY[c.status];
        const ok = copy.tone === 'success';
        return (
          <Card key={c.id} onPress={() => router.push('/bank/connections')} accessibilityLabel="Gérer mes connexions bancaires" style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" numberOfLines={1}>
                  {c.institution}
                </T>
                <T v="small" color={colors.textMuted}>
                  Synchronisé {relativeTime(c.lastSyncAt)}
                </T>
              </View>
              {c.demo ? <Pill label="DÉMO" color={colors.demo} bg={colors.demoSoft} /> : <Pill label={copy.title.toUpperCase()} color={ok ? colors.onColor : colors.reward} bg={ok ? colors.primary : colors.rewardSoft} />}
            </Row>
            {bank.accounts
              .filter((a) => a.connectionId === c.id)
              .map((a) => (
                <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                  <T v="small" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                    {a.name}
                  </T>
                  <T v="bodyStrong" style={{ fontFamily: fonts.mono }}>
                    {a.balanceMinor !== null && a.currency ? money(a.balanceMinor, a.currency) : 'Solde indisponible'}
                  </T>
                </Row>
              ))}
          </Card>
        );
      })}
    </View>
  );
}

export default function Home() {
  const { data, today } = useStore();
  const evals = useQuestEvaluations();
  const active = data.userQuests.filter((q) => q.status === 'active');
  const reviewDone = data.weeklyReviews.some((w) => isoWeekKey(w.date) === isoWeekKey(today));
  const myChallenges = data.challenges.filter((c) => c.endDate >= today && c.participants.some((p) => p.userId === 'me' && !p.left));

  return (
    <Screen>
      <Header />
      <HeroCard />
      <ActionRow />
      <Tiles />
      <View style={{ marginTop: space.md }}>
        <LevelCard />
      </View>
      <StreakCard />

      {!reviewDone ? (
        <Card style={{ marginTop: space.md }} onPress={() => router.push('/review')} accessibilityLabel="Faire mon bilan de la semaine">
          <Row>
            <View style={[styles.miniCircle, { backgroundColor: colors.reward }]}>
              <Icon name="receipt" size={20} color={colors.onColor} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="heading">Bilan de la semaine</T>
              <T v="small" color={colors.textMuted}>
                2 minutes pour faire le point · +20 XP
              </T>
            </View>
            <Icon name="right" color={colors.reward} />
          </Row>
        </Card>
      ) : null}

      <SectionTitle title="Mes comptes" action="Gérer" onAction={() => router.push('/bank/connections')} />
      <BankCard />

      <SectionTitle title="Quêtes en cours" action="Toutes" onAction={() => router.push('/(tabs)/quests')} />
      {active.length === 0 ? (
        <Card onPress={() => router.push('/(tabs)/quests')}>
          <T color={colors.textMuted}>Choisis ta première quête : de petites missions, de vrais progrès.</T>
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
                  <Pill label={ev.state === 'ready' ? 'À VALIDER' : `+${def.xp} XP`} color={ev.state === 'ready' ? colors.onColor : colors.quest} bg={ev.state === 'ready' ? colors.primary : colors.questSoft} />
                </Row>
                <ProgressBar value={ev.progress} color={colors.quest} track={colors.cardHigh} label={def.title} />
                <T v="small" color={colors.textMuted}>
                  {ev.detail}
                </T>
              </Card>
            );
          })}
        </View>
      )}

      <Pressable onPress={() => router.push('/challenges')} accessibilityRole="button" accessibilityLabel="Défis" style={styles.challenges}>
        <T v="hero" color={colors.text} style={{ fontSize: 34, lineHeight: 38 }}>
          Défis
        </T>
        <T v="small" color={colors.text}>
          {myChallenges.length ? `${myChallenges.length} défi${myChallenges.length > 1 ? 's' : ''} en cours avec tes amis` : 'Lance un défi : seuls vos scores sont partagés, jamais vos montants.'}
        </T>
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 }}>
          <T v="tiny" color={colors.onColor} style={{ fontFamily: fonts.displaySemi }}>
            {myChallenges.length ? 'VOIR' : 'LANCER UN DÉFI'}
          </T>
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeCount: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.quest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    borderTopRightRadius: 8,
    padding: space.lg,
    paddingRight: space.xs,
    minHeight: 150,
  },
  projection: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, marginTop: 6 },
  actionCircle: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.background },
  tile: { flex: 1, padding: space.md, gap: 2 },
  level: { backgroundColor: colors.reward, borderRadius: radius.lg, padding: space.lg, gap: 4 },
  dot: { flex: 1, height: 10, borderRadius: 5 },
  streakDay: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 1 },
  miniCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  challenges: { marginTop: space.xl, backgroundColor: colors.challenge, borderRadius: radius.xl, padding: space.xl, gap: 6 },
});

