import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// Petites scènes pour les états vides : elles invitent à agir sans culpabiliser.
export function EmptyArt({ kind }: { kind: 'chest' | 'quest' | 'bank' | 'friends' }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={150} height={104} viewBox="0 0 150 104">
      <Ellipse cx={75} cy={96} rx={52} ry={6} fill="#28243A" opacity={0.06} />
      <Circle cx={30} cy={22} r={6} fill="#FFC857" opacity={0.7} />
      <Circle cx={124} cy={30} r={4} fill="#45C7B8" opacity={0.7} />
      <Path d="M118 70c0-4 3-7 7-7" stroke="#FF806E" strokeWidth={3} strokeLinecap="round" fill="none" />
      {kind === 'chest' ? (
        <>
          <Rect x={44} y={48} width={62} height={44} rx={10} fill="#7856E8" />
          <Path d="M44 50v-6c0-11 9-18 31-18s31 7 31 18v6z" fill="#9E84F4" />
          <Rect x={68} y={56} width={14} height={16} rx={4} fill="#FFC857" />
        </>
      ) : null}
      {kind === 'quest' ? (
        <>
          <Path d="M40 90c8-30 30-20 36-40s24-24 34-20" stroke="#FF806E" strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" fill="none" />
          <Path d="M104 14v30M104 14h18l-5 7 5 7h-18" stroke="#28243A" strokeWidth={3} strokeLinejoin="round" fill="#FFC857" />
          <Circle cx={40} cy={90} r={6} fill="#7856E8" />
        </>
      ) : null}
      {kind === 'bank' ? (
        <>
          <Path d="M75 14 112 32H38z" fill="#45C7B8" />
          <Rect x={44} y={36} width={10} height={40} rx={3} fill="#9EE3DA" />
          <Rect x={70} y={36} width={10} height={40} rx={3} fill="#9EE3DA" />
          <Rect x={96} y={36} width={10} height={40} rx={3} fill="#9EE3DA" />
          <Rect x={36} y={78} width={78} height={10} rx={4} fill="#45C7B8" />
          <Circle cx={106} cy={74} r={15} fill="#FFFFFF" stroke="#7856E8" strokeWidth={3} />
          <Path d="M100 74l4 4 8-8" stroke="#7856E8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : null}
      {kind === 'friends' ? (
        <>
          <Circle cx={58} cy={52} r={18} fill="#FF806E" />
          <Circle cx={94} cy={56} r={16} fill="#45C7B8" />
          <Rect x={38} y={74} width={40} height={18} rx={9} fill="#FF806E" opacity={0.6} />
          <Rect x={76} y={76} width={36} height={16} rx={8} fill="#45C7B8" opacity={0.6} />
          <Path d="M76 26l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" fill="#FFC857" />
        </>
      ) : null}
    </Svg>
    </View>
  );
}
