import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { GoalStage } from '@shared/domain/savings.ts';
import { colors } from '@/theme/tokens';

// Le coffre VAULT : une porte de chambre forte en acier sombre. L'anneau néon s'allume
// segment par segment avec la progression des sous-coffres (stade 0 à 4).
// C'est une image du suivi, pas un compte : il ne contient aucun argent réel.

const W = 220;
const H = 190;
const CX = 110;
const CY = 92;
const SEGMENTS = 24;

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arc(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Molette centrale : tourne d'un cran à chaque mise de côté. */
function Dial({ turn }: { turn: number }) {
  const rot = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    rot.value = withSequence(withTiming(rot.value + 200, { duration: 520, easing: Easing.out(Easing.cubic) }), withSpring(rot.value + 180, { damping: 9 }));
  }, [turn, rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const S = 76;
  return (
    <Animated.View style={[{ position: 'absolute', left: CX - S / 2, top: CY - S / 2, width: S, height: S }, style]} pointerEvents="none">
      <Svg width={S} height={S} viewBox="0 0 76 76">
        <Defs>
          <LinearGradient id="dial" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#3A4234" />
            <Stop offset="1" stopColor="#161A13" />
          </LinearGradient>
        </Defs>
        <Circle cx={38} cy={38} r={36} fill="url(#dial)" stroke="#4A5442" strokeWidth={1.5} />
        {Array.from({ length: 40 }, (_, i) => {
          const a = (i * 9 * Math.PI) / 180;
          const long = i % 5 === 0;
          return (
            <Line
              key={i}
              x1={38 + 33 * Math.sin(a)}
              y1={38 - 33 * Math.cos(a)}
              x2={38 + (long ? 27 : 30) * Math.sin(a)}
              y2={38 - (long ? 27 : 30) * Math.cos(a)}
              stroke={long ? colors.text : '#6B7562'}
              strokeWidth={long ? 1.6 : 1}
              strokeLinecap="round"
            />
          );
        })}
        {/* Poignée en croix */}
        <Rect x={35} y={12} width={6} height={52} rx={3} fill="#2A3224" stroke="#5A6650" strokeWidth={1} />
        <Rect x={12} y={35} width={52} height={6} rx={3} fill="#2A3224" stroke="#5A6650" strokeWidth={1} />
        <Circle cx={38} cy={38} r={10} fill="#1E241A" stroke={colors.primary} strokeWidth={2} />
        <Circle cx={38} cy={38} r={3} fill={colors.primary} />
        <Path d="M38 6l3 5h-6z" fill={colors.primary} />
      </Svg>
    </Animated.View>
  );
}

export function Chest({ stage, size = 1, celebrate = 0 }: { stage: GoalStage; size?: number; celebrate?: number }) {
  const glow = useSharedValue(0.35);
  const pulse = useSharedValue(1);

  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(0.75, { duration: 1800, easing: Easing.inOut(Easing.quad) }), withTiming(0.35, { duration: 1800, easing: Easing.inOut(Easing.quad) })), -1);
  }, [glow]);

  // Petite célébration quand une contribution est ajoutée (pas au premier affichage).
  const lastCelebrate = useRef(celebrate);
  useEffect(() => {
    if (celebrate === lastCelebrate.current) return;
    lastCelebrate.current = celebrate;
    pulse.value = withSequence(withTiming(1.05, { duration: 160 }), withSpring(1, { damping: 7, stiffness: 180 }));
  }, [celebrate, pulse]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: stage === 0 ? 0.15 : glow.value }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Segments allumés : un quart de l'anneau par stade, plein au stade 4.
  const lit = Math.round((stage / 4) * SEGMENTS);
  const full = stage >= 4;
  const ringColor = full ? colors.reward : colors.primary;
  const step = 360 / SEGMENTS;

  return (
    <View style={{ width: W * size, height: H * size }} accessibilityRole="image" accessibilityLabel={`Coffre-fort rempli au stade ${stage} sur 4`}>
      <View style={{ position: 'absolute', width: W, height: H, left: (W * size - W) / 2, top: (H * size - H) / 2, transform: [{ scale: size }] }}>
        <Animated.View style={[{ width: W, height: H }, bodyStyle]}>
          {/* Halo néon */}
          <Animated.View style={[{ position: 'absolute', width: W, height: H }, glowStyle]} pointerEvents="none">
            <Svg width={W} height={H}>
              <Defs>
                <RadialGradient id="halo" cx="50%" cy="48%" r="50%">
                  <Stop offset="0.55" stopColor={ringColor} stopOpacity={0.35} />
                  <Stop offset="1" stopColor={ringColor} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={CX} cy={CY} r={96} fill="url(#halo)" />
            </Svg>
          </Animated.View>

          <Svg width={W} height={H} style={{ position: 'absolute' }}>
            <Defs>
              <LinearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#2E3628" />
                <Stop offset="1" stopColor="#11140E" />
              </LinearGradient>
              <LinearGradient id="door" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#262D21" />
                <Stop offset="1" stopColor="#141811" />
              </LinearGradient>
            </Defs>

            {/* Pieds et ombre */}
            <Rect x={58} y={170} width={22} height={10} rx={3} fill="#0A0C08" />
            <Rect x={140} y={170} width={22} height={10} rx={3} fill="#0A0C08" />

            {/* Caisson carré aux coins arrondis */}
            <Rect x={28} y={8} width={164} height={166} rx={26} fill="url(#frame)" stroke="#3A4434" strokeWidth={1.5} />
            <Rect x={34} y={14} width={152} height={154} rx={21} fill="none" stroke="#000000" strokeOpacity={0.35} strokeWidth={2} />

            {/* Charnières */}
            <Rect x={22} y={44} width={10} height={24} rx={4} fill="#3A4434" />
            <Rect x={22} y={116} width={10} height={24} rx={4} fill="#3A4434" />

            {/* Rivets */}
            {[
              [44, 24],
              [176, 24],
              [44, 160],
              [176, 160],
            ].map(([x, y]) => (
              <G key={`${x}-${y}`}>
                <Circle cx={x} cy={y} r={3.2} fill="#4A5442" />
                <Circle cx={x - 0.8} cy={y - 0.8} r={1.1} fill="#7A8670" />
              </G>
            ))}

            {/* Porte ronde */}
            <Circle cx={CX} cy={CY} r={70} fill="#0B0D09" />
            <Circle cx={CX} cy={CY} r={64} fill="url(#door)" stroke="#3A4434" strokeWidth={1.5} />

            {/* Anneau segmenté : progression */}
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const on = i < lit;
              return (
                <Path
                  key={i}
                  d={arc(57, i * step + 2.2, (i + 1) * step - 2.2)}
                  stroke={on ? ringColor : '#2A3224'}
                  strokeWidth={6}
                  strokeLinecap="round"
                  fill="none"
                  opacity={on ? 1 : 0.9}
                />
              );
            })}

            {/* Verrous périphériques */}
            {[0, 90, 180, 270].map((deg) => {
              const p = polar(46, deg);
              return <Circle key={deg} cx={p.x} cy={p.y} r={3} fill={stage > 0 ? ringColor : '#3A4434'} opacity={stage > 0 ? 0.85 : 1} />;
            })}

            {/* Reflet sur l'acier */}
            <Path d={arc(66, 300, 350)} stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={3} strokeLinecap="round" fill="none" />
          </Svg>

          <Dial turn={celebrate} />
        </Animated.View>
      </View>
    </View>
  );
}
