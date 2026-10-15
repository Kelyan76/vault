import { useEffect, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { ACHIEVEMENTS } from '@shared/domain/achievements.ts';
import { levelTitle } from '@shared/domain/xp.ts';
import { useStore } from '@/store/store';
import { colors, radius, space } from '@/theme/tokens';
import { Button, PopIn, T } from './primitives';
import { BadgeMedal } from './BadgeMedal';

function Confetti({ index }: { index: number }) {
  const y = useSharedValue(-40);
  const r = useSharedValue(0);
  const x = useMemo(() => ((index * 47) % 100) / 100, [index]);
  const color = [colors.reward, colors.quest, colors.habit, colors.primary, colors.success][index % 5];
  useEffect(() => {
    y.value = withDelay((index % 7) * 90, withTiming(560, { duration: 1700 + (index % 5) * 180, easing: Easing.in(Easing.quad) }));
    r.value = withDelay((index % 7) * 90, withTiming(360 * (index % 2 ? 1 : -1), { duration: 1800 }));
  }, [index, y, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${r.value}deg` }], opacity: y.value > 480 ? 0 : 1 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: `${x * 100}%` }, style]}>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        {index % 3 === 0 ? (
          <Path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill={color} />
        ) : (
          <Path d="M4 4h16v16H4z" fill={color} />
        )}
      </Svg>
    </Animated.View>
  );
}

/** Petite célébration après une action réussie : XP, badge débloqué, nouveau niveau. */
export function CelebrationHost() {
  const { effects, consumeEffects, space: sp } = useStore();
  const visible = !!effects;
  useEffect(() => {
    if (visible) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible]);
  if (!effects) return null;
  const total = effects.xp.reduce((s, x) => s + x.amount, 0);
  const badges = ACHIEVEMENTS.filter((a) => effects.badges.includes(a.id));
  return (
    <Modal transparent animationType="fade" visible onRequestClose={consumeEffects}>
      <Pressable style={styles.backdrop} onPress={consumeEffects} accessibilityLabel="Fermer">
        {Array.from({ length: 22 }, (_, i) => (
          <Confetti key={i} index={i} />
        ))}
        <Pressable style={styles.sheet} onPress={() => {}}>
          {effects.levelUp ? (
            <PopIn>
              <View style={styles.level}>
                <T v="tiny" color={colors.onPrimary}>
                  NOUVEAU NIVEAU
                </T>
                <T v="hero" color={colors.onPrimary}>
                  {effects.levelUp}
                </T>
                <T v="small" color={colors.onPrimary}>
                  {levelTitle(effects.levelUp)}
                </T>
              </View>
            </PopIn>
          ) : null}
          {total > 0 ? (
            <PopIn delay={120}>
              <T v="hero" center color={colors.primary}>
                +{total} XP
              </T>
            </PopIn>
          ) : null}
          {effects.xp.map((x, i) => (
            <T key={i} v="small" color={colors.textMuted} center>
              {x.label} · +{x.amount}
            </T>
          ))}
          {badges.map((b, i) => (
            <PopIn key={b.id} delay={260 + i * 120}>
              <View style={styles.badgeRow}>
                <BadgeMedal id={b.id} color={b.color} size={56} unlocked />
                <View style={{ flex: 1 }}>
                  <T v="tiny" color={colors.rewardInk}>
                    BADGE DÉBLOQUÉ
                  </T>
                  <T v="bodyStrong">{b.title}</T>
                  <T v="small" color={colors.textMuted}>
                    {b.description}
                  </T>
                </View>
              </View>
            </PopIn>
          ))}
          {sp === 'demo' ? (
            <T v="small" center color={colors.demo}>
              Progression de la démo : elle reste dans l’espace démo.
            </T>
          ) : null}
          <Button label="Continuer" onPress={consumeEffects} style={{ marginTop: space.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,7,4,0.72)', justifyContent: 'center', padding: space.xl, overflow: 'hidden' },
  sheet: { backgroundColor: colors.card, borderRadius: radius.xl, padding: space.xl, gap: space.sm, maxWidth: 420, width: '100%', alignSelf: 'center' },
  level: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.lg, alignItems: 'center' },
  badgeRow: { flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: colors.rewardSoft, borderRadius: radius.md, padding: space.md },
});
