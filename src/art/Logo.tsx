import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/** Marque VAULT : un petit coffre en pixels, posé sur une ligne de base. */
export function LogoMark({ size = 30 }: { size?: number }) {
  const px = (x: number, y: number, w = 1, h = 1, fill: string = colors.text) => <Rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} fill={fill} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" accessibilityLabel="VAULT">
      {/* couvercle */}
      {px(2, 2, 8, 1)}
      {px(1, 3, 10, 1)}
      {px(1, 4, 1, 1)}
      {px(10, 4, 1, 1)}
      {/* corps */}
      {px(1, 5, 10, 1)}
      {px(1, 6, 1, 4)}
      {px(10, 6, 1, 4)}
      {px(1, 10, 10, 1)}
      {/* serrure */}
      {px(5, 6, 2, 2, colors.primary)}
      {px(5.5, 8, 1, 1, colors.primary)}
      <Path d="M10.5 0.5h1v1h-1z" fill={colors.primary} />
    </Svg>
  );
}
