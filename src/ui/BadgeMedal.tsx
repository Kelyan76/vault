import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { AchievementId } from '@shared/domain/achievements.ts';
import { colors } from '@/theme/tokens';

const COLORS = { violet: colors.primary, turquoise: colors.habit, gold: colors.reward, coral: colors.quest, green: colors.success } as const;

const GLYPH: Record<AchievementId, string> = {
  first_quest: 'M24 33V17m0 0h9l-2 3.5 2 3.5h-9',
  first_week: 'M17 20h14v12H17zM17 24h14M21 17v4m6-4v4',
  first_goal: 'M24 34a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-5a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  first_streak: 'M24 34c4 0 6.5-2.6 6.5-6 0-4.3-3.6-6.2-4.4-10.2-2.2 1.5-3.5 3.9-3.3 6.5-1.1-.6-1.9-1.7-2.2-3-1.4 1.5-3.1 3.7-3.1 6.7 0 3.4 2.5 6 6.5 6z',
  first_challenge: 'M19 16h10v5a5 5 0 0 1-10 0zM24 26v4m-4 4h8',
  first_month: 'M16 31l5-6 4 3 7-9',
  first_avoided: 'M17 24.5l4.5 4.5L31 19.5',
};

export function BadgeMedal({ id, color, size = 64, unlocked }: { id: AchievementId; color: keyof typeof COLORS; size?: number; unlocked: boolean }) {
  const c = unlocked ? COLORS[color] : '#CFC8BC';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel={unlocked ? 'Badge débloqué' : 'Badge verrouillé'}>
      <Path d="M15 3h6l3 9-6 2zM33 3h-6l-3 9 6 2z" fill={unlocked ? colors.quest : '#E2DCD2'} />
      <Polygon points="24,8 38,16 38,32 24,40 10,32 10,16" fill={c} />
      <Polygon points="24,12 34.5,18 34.5,30 24,36 13.5,30 13.5,18" fill="#FFFFFF" opacity={unlocked ? 0.22 : 0.4} />
      <Path d={GLYPH[id]} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {!unlocked ? <Circle cx={38} cy={38} r={7} fill="#B8B1A5" /> : null}
      {!unlocked ? <Path d="M35.5 38v-1.5a2.5 2.5 0 0 1 5 0V38m-6 0h7v4h-7z" stroke="#FFFFFF" strokeWidth={1.3} fill="none" /> : null}
    </Svg>
  );
}
