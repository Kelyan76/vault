import { View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '@/theme/tokens';

/** Anneau de répartition : chaque segment est une catégorie, avec un petit espace entre segments. */
export function Donut({ parts, size = 168, thickness = 22, centerLabel, centerValue }: { parts: { value: number; color: string; key: string }[]; size?: number; thickness?: number; centerLabel?: string; centerValue?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = parts.length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <Svg width={size} height={size} accessibilityLabel={centerLabel ? `${centerLabel} ${centerValue ?? ''}` : 'Répartition'}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={thickness} fill="none" />
      <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total > 0
          ? parts.map((p) => {
              const len = (p.value / total) * c;
              const seg = (
                <Circle
                  key={p.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={p.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  fill="none"
                />
              );
              offset += len;
              return seg;
            })
          : null}
      </G>
      {centerValue ? (
        <SvgText x={size / 2} y={size / 2 + 6} textAnchor="middle" fontFamily={fonts.display} fontSize={20} fill={colors.text}>
          {centerValue}
        </SvgText>
      ) : null}
      {centerLabel ? (
        <SvgText x={size / 2} y={size / 2 + 26} textAnchor="middle" fontFamily={fonts.bodyMedium} fontSize={11} fill={colors.textMuted}>
          {centerLabel}
        </SvgText>
      ) : null}
    </Svg>
  );
}

/** Barres verticales simples avec une ligne de référence (ex. moyenne de la période précédente). */
export function Bars({ values, labels, height = 120, color = colors.primary, highlightLast, reference }: { values: number[]; labels?: string[]; height?: number; color?: string; highlightLast?: boolean; reference?: number }) {
  const max = Math.max(1, ...values, reference ?? 0);
  const n = values.length;
  const w = 300;
  const bw = Math.max(3, (w / n) * 0.62);
  const step = w / n;
  return (
    <View>
      <Svg width="100%" height={height + (labels ? 18 : 0)} viewBox={`0 0 ${w} ${height + (labels ? 18 : 0)}`} preserveAspectRatio="none">
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 3 : 0, (v / max) * (height - 6));
          const last = highlightLast && i === n - 1;
          return <Rect key={i} x={i * step + (step - bw) / 2} y={height - h} width={bw} height={h} rx={Math.min(5, bw / 2)} fill={last ? colors.quest : color} opacity={last || !highlightLast ? 1 : 0.75} />;
        })}
        {reference ? <Line x1={0} x2={w} y1={height - (reference / max) * (height - 6)} y2={height - (reference / max) * (height - 6)} stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth={1} /> : null}
        {labels
          ? labels.map((l, i) =>
              l ? (
                <SvgText key={i} x={i * step + step / 2} y={height + 14} textAnchor="middle" fontFamily={fonts.bodyMedium} fontSize={10} fill={colors.textMuted}>
                  {l}
                </SvgText>
              ) : null,
            )
          : null}
      </Svg>
    </View>
  );
}

/** Anneau de progression (objectifs, niveau). */
export function Ring({ value, size = 64, thickness = 7, color = colors.habit, track = colors.habitSoft }: { value: number; size?: number; thickness?: number; color?: string; track?: string }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={thickness}
        fill="none"
        strokeDasharray={`${c * v} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
