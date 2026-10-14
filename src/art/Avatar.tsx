import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { Avatar as AvatarId } from '@/store/types';

// Avatars animaux vectoriels, sobres et expressifs, déclinés dans la palette VAULT.
const SPEC: Record<AvatarId, { bg: string; head: string; ear: string; inner: string; snout?: string; label: string }> = {
  fox: { bg: '#FFE9E5', head: '#FF806E', ear: '#FF806E', inner: '#FFF9F1', snout: '#FFF9F1', label: 'Renard' },
  owl: { bg: '#EEE8FD', head: '#7856E8', ear: '#7856E8', inner: '#FFC857', label: 'Hibou' },
  cat: { bg: '#FFF3D6', head: '#FFC857', ear: '#FFC857', inner: '#FF806E', snout: '#FFF9F1', label: 'Chat' },
  bear: { bg: '#F5F0E8', head: '#B98A66', ear: '#B98A66', inner: '#E8C9AE', snout: '#E8C9AE', label: 'Ours' },
  panda: { bg: '#E1F6F3', head: '#FFFFFF', ear: '#28243A', inner: '#28243A', label: 'Panda' },
  frog: { bg: '#E3F4EC', head: '#50B98A', ear: '#50B98A', inner: '#FFFFFF', label: 'Grenouille' },
  koala: { bg: '#ECE9FB', head: '#A8A3B8', ear: '#A8A3B8', inner: '#E9E4F2', label: 'Koala' },
  tiger: { bg: '#FFE9E5', head: '#FFA24C', ear: '#FFA24C', inner: '#FFF9F1', snout: '#FFF9F1', label: 'Tigre' },
};

export const AVATARS = Object.keys(SPEC) as AvatarId[];
export const avatarLabel = (a: AvatarId) => SPEC[a].label;

export function Avatar({ id, size = 48, ring }: { id: AvatarId; size?: number; ring?: string }) {
  const s = SPEC[id] ?? SPEC.fox;
  const pointy = id === 'fox' || id === 'cat' || id === 'tiger' || id === 'owl';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={`Avatar ${s.label}`}>
      <Rect x={0} y={0} width={64} height={64} rx={22} fill={s.bg} />
      {ring ? <Rect x={1.5} y={1.5} width={61} height={61} rx={21} fill="none" stroke={ring} strokeWidth={3} /> : null}
      {id === 'frog' ? (
        <>
          <Circle cx={22} cy={22} r={8} fill={s.head} />
          <Circle cx={42} cy={22} r={8} fill={s.head} />
        </>
      ) : pointy ? (
        <>
          <Path d="M14 28 17 10l12 10z" fill={s.ear} />
          <Path d="M50 28 47 10 35 20z" fill={s.ear} />
          <Path d="M18 24l1.5-8 6 5z" fill={s.inner} />
          <Path d="M46 24l-1.5-8-6 5z" fill={s.inner} />
        </>
      ) : (
        <>
          <Circle cx={17} cy={19} r={id === 'koala' ? 10 : 7} fill={s.ear} />
          <Circle cx={47} cy={19} r={id === 'koala' ? 10 : 7} fill={s.ear} />
          <Circle cx={17} cy={19} r={id === 'koala' ? 5 : 3.5} fill={s.inner} />
          <Circle cx={47} cy={19} r={id === 'koala' ? 5 : 3.5} fill={s.inner} />
        </>
      )}
      <Ellipse cx={32} cy={36} rx={19} ry={17} fill={s.head} stroke={id === 'panda' ? '#E7E1D6' : 'none'} strokeWidth={1.5} />
      {id === 'panda' ? (
        <>
          <Ellipse cx={25} cy={34} rx={5} ry={6} fill="#28243A" />
          <Ellipse cx={39} cy={34} rx={5} ry={6} fill="#28243A" />
        </>
      ) : null}
      {id === 'tiger' ? <Path d="M32 20v5M26 21l1 4M38 21l-1 4" stroke="#28243A" strokeWidth={2} strokeLinecap="round" /> : null}
      {s.snout ? <Ellipse cx={32} cy={42} rx={9} ry={6.5} fill={s.snout} /> : null}
      {id === 'owl' ? (
        <>
          <Circle cx={25} cy={34} r={6} fill="#FFF9F1" />
          <Circle cx={39} cy={34} r={6} fill="#FFF9F1" />
          <Path d="M29.5 40 32 44l2.5-4z" fill="#FFC857" />
        </>
      ) : null}
      {id === 'frog' ? (
        <>
          <Circle cx={22} cy={22} r={3.5} fill="#FFFFFF" />
          <Circle cx={42} cy={22} r={3.5} fill="#FFFFFF" />
          <Circle cx={22} cy={22} r={1.8} fill="#28243A" />
          <Circle cx={42} cy={22} r={1.8} fill="#28243A" />
          <Path d="M24 42c4 3 12 3 16 0" stroke="#28243A" strokeWidth={2} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <Circle cx={25} cy={34} r={2.4} fill={id === 'panda' ? '#FFFFFF' : '#28243A'} />
          <Circle cx={39} cy={34} r={2.4} fill={id === 'panda' ? '#FFFFFF' : '#28243A'} />
          {id !== 'owl' ? <Ellipse cx={32} cy={40} rx={2.6} ry={2} fill="#28243A" /> : null}
          {id !== 'owl' ? <Path d="M28.5 44c2 1.6 5 1.6 7 0" stroke="#28243A" strokeWidth={1.6} strokeLinecap="round" fill="none" /> : null}
        </>
      )}
    </Svg>
  );
}
