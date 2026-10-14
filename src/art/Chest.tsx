import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { GoalStage } from '@shared/domain/savings.ts';

// Le coffre VAULT : il évolue avec la progression des objectifs (stade 0 à 4).
// C'est une image du suivi, pas un compte : il ne contient aucun argent réel.

const W = 220;
const H = 190;

function Coin({ x, y, r = 11, delay = 0, float = true }: { x: number; y: number; r?: number; delay?: number; float?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!float) return;
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(-6, { duration: 1300, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) })), -1));
  }, [t, delay, float]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: t.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2 }, style]} pointerEvents="none">
      <Svg width={r * 2} height={r * 2} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={11} fill="#FFC857" stroke="#E0A630" strokeWidth={1.6} />
        <Circle cx={12} cy={12} r={7} fill="none" stroke="#E0A630" strokeWidth={1.4} />
        <Path d="M10 9.5h4M10 14.5h4M12 8v8" stroke="#B57E10" strokeWidth={1.4} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function Sparkle({ x, y, size = 14, delay = 0, color = '#FFC857' }: { x: number; y: number; size?: number; delay?: number; color?: string }) {
  const s = useSharedValue(0.3);
  useEffect(() => {
    s.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.3, { duration: 900 })), -1));
  }, [s, delay]);
  const style = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill={color} />
      </Svg>
    </Animated.View>
  );
}

export function Chest({ stage, size = 1, celebrate = 0 }: { stage: GoalStage; size?: number; celebrate?: number }) {
  const lid = useSharedValue(0);
  const bounce = useSharedValue(1);
  const open = stage >= 2 ? (stage >= 3 ? 1 : 0.55) : 0;

  useEffect(() => {
    lid.value = withSpring(open, { damping: 12, stiffness: 90 });
  }, [open, lid]);

  // Petite célébration quand une contribution est ajoutée (pas au premier affichage).
  const lastCelebrate = useRef(celebrate);
  useEffect(() => {
    if (celebrate === lastCelebrate.current) return;
    lastCelebrate.current = celebrate;
    bounce.value = withSequence(withTiming(1.08, { duration: 140 }), withSpring(1, { damping: 6, stiffness: 180 }));
    lid.value = withSequence(withTiming(1, { duration: 220 }), withDelay(600, withSpring(open, { damping: 12 })));
  }, [celebrate, bounce, lid, open]);

  // Pivot autour de la charnière arrière gauche (x=42, y=96) : RN fait tourner autour du centre, on décale donc le repère.
  const HX = 42 - W / 2;
  const HY = 96 - H / 2;
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: HX }, { translateY: HY }, { rotate: `${-24 * lid.value}deg` }, { translateX: -HX }, { translateY: -HY }],
  }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));

  return (
    <View style={{ width: W * size, height: H * size }} accessibilityRole="image" accessibilityLabel={`Coffre au stade ${stage} sur 4`}>
      <View style={{ position: 'absolute', width: W, height: H, left: (W * size - W) / 2, top: (H * size - H) / 2, transform: [{ scale: size }] }}>
      <Animated.View style={[{ width: W, height: H }, bodyStyle]}>
        {/* Halo */}
        <Svg width={W} height={H} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="halo" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFC857" stopOpacity={stage >= 3 ? 0.45 : 0.18} />
              <Stop offset="1" stopColor="#FFC857" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Ellipse cx={110} cy={92} rx={98} ry={78} fill="url(#halo)" />
          <Ellipse cx={110} cy={176} rx={76} ry={9} fill="#28243A" opacity={0.08} />
        </Svg>

        {/* Trésor visible quand le coffre s'ouvre */}
        {stage >= 2 ? (
          <Svg width={W} height={H} style={{ position: 'absolute' }}>
            <Ellipse cx={110} cy={92} rx={58} ry={16} fill="#FFDB86" />
            <Circle cx={88} cy={88} r={10} fill="#FFC857" stroke="#E0A630" strokeWidth={1.5} />
            <Circle cx={110} cy={84} r={11} fill="#FFC857" stroke="#E0A630" strokeWidth={1.5} />
            <Circle cx={132} cy={89} r={10} fill="#FFC857" stroke="#E0A630" strokeWidth={1.5} />
            {stage >= 3 ? <Circle cx={99} cy={78} r={9} fill="#FFD36E" stroke="#E0A630" strokeWidth={1.5} /> : null}
            {stage >= 4 ? <Path d="M118 70l4-12 4 12 12 1-10 6 4 12-10-8-10 8 4-12-10-6z" fill="#FF806E" /> : null}
          </Svg>
        ) : null}

        {/* Corps */}
        <Svg width={W} height={H} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="body" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#8D6CF0" />
              <Stop offset="1" stopColor="#6443D6" />
            </LinearGradient>
          </Defs>
          <Rect x={42} y={92} width={136} height={80} rx={16} fill="url(#body)" />
          <Rect x={42} y={92} width={136} height={14} fill="#5636C4" opacity={0.5} />
          <Rect x={60} y={92} width={14} height={80} fill="#FFC857" />
          <Rect x={146} y={92} width={14} height={80} fill="#FFC857" />
          <Rect x={93} y={110} width={34} height={36} rx={9} fill="#FFC857" stroke="#E0A630" strokeWidth={2} />
          <Circle cx={110} cy={124} r={5} fill="#5636C4" />
          <Path d="M110 128v9" stroke="#5636C4" strokeWidth={4} strokeLinecap="round" />
          <G opacity={0.25}>
            <Rect x={48} y={160} width={124} height={6} rx={3} fill="#FFFFFF" />
          </G>
        </Svg>

        {/* Couvercle animé */}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H }, lidStyle]}>
          <Svg width={W} height={H}>
            <Defs>
              <LinearGradient id="lid" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#A086F5" />
                <Stop offset="1" stopColor="#7856E8" />
              </LinearGradient>
            </Defs>
            <Path d="M42 96V78c0-22 18-34 68-34s68 12 68 34v18z" fill="url(#lid)" />
            <Path d="M60 50.5V96h14V46.5zM146 46.5V96h14V50.5z" fill="#FFC857" />
            <Path d="M54 66c10-10 30-14 56-14" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={5} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {stage >= 1 ? <Coin x={38} y={150} r={10} delay={200} /> : null}
      {stage >= 2 ? <Coin x={186} y={140} r={12} delay={600} /> : null}
      {stage >= 3 ? <Coin x={170} y={40} r={9} delay={900} /> : null}
      {stage >= 3 ? <Sparkle x={30} y={60} delay={300} /> : null}
      {stage >= 4 ? <Sparkle x={180} y={78} size={18} delay={700} color="#45C7B8" /> : null}
      {stage >= 4 ? <Sparkle x={66} y={18} size={12} delay={1100} color="#FF806E" /> : null}
      </View>
    </View>
  );
}
