import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { levelTitle } from '@shared/domain/xp.ts';
import { Avatar } from '@/art/Avatar';
import { useProgress, useStreaks } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Icon } from '@/ui/Icon';
import { Card, ProgressBar, Row, T } from '@/ui/primitives';
import { colors, radius, space } from '@/theme/tokens';

/** Carte principale : niveau, XP, meilleure série et badges. */
export function PlayerCard() {
  const { data } = useStore();
  const lvl = useProgress();
  const streaks = useStreaks();
  const best = Math.max(0, ...[...streaks.values()].map((s) => s.current));
  return (
    <Card style={styles.card} onPress={() => router.push('/badges')} accessibilityLabel={`Niveau ${lvl.level}, ${lvl.xp} XP. Voir les badges`}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="pc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#8B6CF2" />
            <Stop offset="1" stopColor="#5B3BD6" />
          </LinearGradient>
        </Defs>
        <Rect width={340} height={190} fill="url(#pc)" />
        <Circle cx={300} cy={20} r={70} fill="#FFFFFF" opacity={0.07} />
        <Circle cx={320} cy={170} r={44} fill="#45C7B8" opacity={0.22} />
        <Path d="M296 36l4-11 4 11 11 1-9 6 3 11-9-7-9 7 3-11-9-6z" fill="#FFC857" opacity={0.9} />
      </Svg>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Avatar id={data.profile.avatar} size={52} ring="#FFFFFF" />
          <View>
            <T v="tiny" color="#E3DAFF">
              NIVEAU {lvl.level} · {levelTitle(lvl.level).toUpperCase()}
            </T>
            <T v="title" color={colors.onPrimary}>
              {data.profile.pseudo}
            </T>
          </View>
        </Row>
      </Row>
      <View style={{ gap: 6, marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="small" color="#E3DAFF">
            {lvl.xp - lvl.levelStartXp} / {lvl.nextLevelXp - lvl.levelStartXp} XP
          </T>
          <T v="small" color="#E3DAFF">
            Niveau {lvl.level + 1} dans {lvl.nextLevelXp - lvl.xp} XP
          </T>
        </Row>
        <ProgressBar value={lvl.progress} color={colors.reward} track="rgba(255,255,255,0.22)" height={12} label="Progression vers le niveau suivant" />
      </View>
      <Row style={{ marginTop: space.md, gap: space.sm }}>
        <View style={styles.stat}>
          <Icon name="flame" size={16} color={colors.quest} />
          <T v="small" color={colors.onPrimary}>
            Série {best} j
          </T>
        </View>
        <View style={styles.stat}>
          <Icon name="trophy" size={16} color={colors.reward} />
          <T v="small" color={colors.onPrimary}>
            {data.achievements.length} badges
          </T>
        </View>
        <View style={styles.stat}>
          <Icon name="flag" size={16} color={colors.habit} />
          <T v="small" color={colors.onPrimary}>
            {(() => { const n = data.userQuests.filter((q) => q.status === 'completed').length; return `${n} quête${n > 1 ? 's' : ''}`; })()}
          </T>
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.primary },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
});
