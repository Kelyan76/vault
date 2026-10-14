import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme/tokens';

// Jeu d'icônes maison, trait de 2 px arrondi, grille 24 : cohérent sur tout l'écran.
const P = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  budget: 'M12 3v9h9M12 3a9 9 0 1 0 9 9',
  quest: 'M6 21V4m0 0h10l-2 3.5L16 11H6',
  vault: 'M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4M10 13h4v3h-4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  right: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  down: 'm6 9 6 6 6-6',
  bank: 'M3 10 12 4l9 6M5 10v8m4.67-8v8m4.66-8v8M19 10v8M3 20h18',
  shield: 'M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  sync: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18 3v4.5h-4.5M6 21v-4.5h4.5',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2-.5-2.6-1.5M12 6.5V8m0 8v1.5',
  flame: 'M12 21c3.6 0 6-2.4 6-5.6 0-3.9-3.3-5.7-4-9.4-2 1.4-3.2 3.6-3 6-1-.6-1.7-1.6-2-2.8-1.3 1.4-3 3.4-3 6.2C6 18.6 8.4 21 12 21z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4m-3.5 3h7l-.5-3h-6z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5-2 4.5 4.5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5v-5m0-3h.01',
  alert: 'M12 4 2.5 20h19zM12 10v4.5m0 2.5h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  cart: 'M3 4h2.5l2.2 10.5h10.6L20.5 7H7M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  plane: 'm3 13 7-1.5L14.5 3H17l-2 8.5 4.5-.5L21 9h1.5l-1 4.5 1 4.5H21l-1.5-2-4.5-.5 2 6.5h-2.5L10 15.5 3 14z',
  laptop: 'M5 6h14v10H5zM3 19h18',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zm9 0v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zm0 0c1.5-3 5-3 5-1s-3 1-5 1z',
  bike: 'M6 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm12 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM6 14.5l3.5-6.5h5l3.5 6.5M9.5 8 12 14.5h-6M14 5h2.5',
  book: 'M5 4.5h5.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H5zm14 0h-5.5A2.5 2.5 0 0 0 11 7v13a2 2 0 0 1 2-2h6z',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  arrowUp: 'M12 19V5m-6 6 6-6 6 6',
  arrowDown: 'M12 5v14m-6-6 6 6 6-6',
  pause: 'M8 5v14m8-14v14',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-4 6-6.5 10-8.5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1.5-2-3.5-2.4.6a7 7 0 0 0-1.6-.9L14.5 4h-5L9 6.7a7 7 0 0 0-1.6.9L5 7l-2 3.5L5 12l-2 1.5L5 17l2.4-.6c.5.4 1 .7 1.6.9l.5 2.7h5l.5-2.7c.6-.2 1.1-.5 1.6-.9L19 17l2-3.5z',
  chart: 'M4 20V10m5.3 10V4m5.4 16v-7M20 20v-4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6m-6 4h3',
  flag: 'M6 21V4m0 0h11l-2.5 4L17 12H6',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.3 4.5 4.5 0 0 1 19.5 10C19.5 15.4 12 20 12 20z',
  mail: 'M3.5 6h17v12h-17zm0 0 8.5 7 8.5-7',
  key: 'M14.5 13a4.5 4.5 0 1 0-4.2-2.9L3.5 17v3.5H7v-2h2v-2h2l1.4-1.4c.6.6 1.3.9 2.1.9z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
} as const;

export type IconName = keyof typeof P | 'dot';

export function Icon({ name, size = 22, color = colors.text, strokeWidth = 2, fill = 'none' }: { name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: string }) {
  if (name === 'dot') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={4} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={P[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill={fill} />
    </Svg>
  );
}

/** Pastille ronde colorée contenant une icône (catégories, quêtes, habitudes). */
export function IconBubble({ name, color, bg, size = 40 }: { name: IconName; color: string; bg: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Rect x={0} y={0} width={40} height={40} rx={14} fill={bg} />
      <Svg x={9} y={9} width={22} height={22} viewBox="0 0 24 24">
        {name === 'dot' ? <Circle cx={12} cy={12} r={4} fill={color} /> : <Path d={P[name]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      </Svg>
    </Svg>
  );
}
