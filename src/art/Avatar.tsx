import Svg, { Circle, Defs, G, Line, Path, Rect, ClipPath, Text as SvgText } from 'react-native-svg';
import type { Avatar as AvatarId } from '@/store/types';
import { colors, fonts } from '@/theme/tokens';

// Badges monogrammes : l'initiale du pseudo sur une couleur de la palette, avec un motif géométrique discret.
// Les identifiants historiques (fox, owl…) sont conservés pour la base de données ; seul le rendu change.

type Motif = 'stripes' | 'dots' | 'grid' | 'ring' | 'corner' | 'bars' | 'cross' | 'wave';

const SPEC: Record<AvatarId, { bg: string; motif: Motif; label: string }> = {
  fox: { bg: '#3FE84E', motif: 'stripes', label: 'Néon, rayures' },
  owl: { bg: '#7D5CFF', motif: 'dots', label: 'Violet, points' },
  cat: { bg: '#FFD23F', motif: 'grid', label: 'Or, grille' },
  bear: { bg: '#FF8A5B', motif: 'ring', label: 'Orange, cercle' },
  panda: { bg: '#F2F5EC', motif: 'corner', label: 'Os, angle' },
  frog: { bg: '#3BC8EA', motif: 'bars', label: 'Cyan, barres' },
  koala: { bg: '#FF55D2', motif: 'cross', label: 'Rose, croix' },
  tiger: { bg: '#B48CFF', motif: 'wave', label: 'Lilas, vague' },
};

export const AVATARS = Object.keys(SPEC) as AvatarId[];
export const avatarLabel = (a: AvatarId) => SPEC[a].label;

/** Initiale affichée : première lettre ou chiffre du pseudo. */
export function initialOf(name?: string | null): string {
  const m = (name ?? '').match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : '';
}

function MotifLayer({ motif }: { motif: Motif }) {
  const ink = 'rgba(13,16,11,0.16)';
  switch (motif) {
    case 'stripes':
      return (
        <G>
          {[-40, -24, -8, 8, 24, 40, 56].map((o) => (
            <Line key={o} x1={o} y1={64} x2={o + 64} y2={0} stroke={ink} strokeWidth={5} />
          ))}
        </G>
      );
    case 'dots':
      return (
        <G>
          {[8, 24, 40, 56].flatMap((x) => [8, 24, 40, 56].map((y) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={2.6} fill={ink} />))}
        </G>
      );
    case 'grid':
      return (
        <G>
          {[16, 32, 48].map((v) => (
            <G key={v}>
              <Line x1={v} y1={0} x2={v} y2={64} stroke={ink} strokeWidth={2} />
              <Line x1={0} y1={v} x2={64} y2={v} stroke={ink} strokeWidth={2} />
            </G>
          ))}
        </G>
      );
    case 'ring':
      return <Circle cx={50} cy={14} r={22} fill="none" stroke={ink} strokeWidth={7} />;
    case 'corner':
      return <Path d="M64 24V64H24z" fill={ink} />;
    case 'bars':
      return (
        <G>
          {[6, 18, 30].map((y) => (
            <Rect key={y} x={0} y={y} width={64} height={5} fill={ink} />
          ))}
        </G>
      );
    case 'cross':
      return <Path d="M46 6h8v12h12v8H54v12h-8V26H34v-8h12z" fill={ink} />;
    case 'wave':
      return <Path d="M0 50c10-8 22-8 32 0s22 8 32 0v14H0z" fill={ink} />;
  }
}

export function Avatar({ id, size = 48, ring, name }: { id: AvatarId; size?: number; ring?: string; name?: string | null }) {
  const s = SPEC[id] ?? SPEC.fox;
  const letter = initialOf(name);
  const clip = `clip-${id}-${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={name ? `Badge de ${name}` : `Badge ${s.label}`}>
      <Defs>
        <ClipPath id={clip}>
          <Rect x={0} y={0} width={64} height={64} rx={20} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        <Rect x={0} y={0} width={64} height={64} fill={s.bg} />
        <MotifLayer motif={s.motif} />
      </G>
      {letter ? (
        <SvgText x={32} y={43} textAnchor="middle" fontFamily={fonts.display} fontSize={30} fill={colors.onColor}>
          {letter}
        </SvgText>
      ) : null}
      {ring ? <Rect x={1.5} y={1.5} width={61} height={61} rx={19} fill="none" stroke={ring} strokeWidth={3} /> : null}
    </Svg>
  );
}
