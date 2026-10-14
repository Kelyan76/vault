// Design system VAULT : une seule source pour les couleurs, espacements, rayons et typographies.
// Chaque couleur a un rôle ; on ne colore pas un élément sans raison.

export const palette = {
  cream: '#FFF9F1',
  sand: '#F5F0E8',
  white: '#FFFFFF',
  ink: '#28243A',
  inkSoft: '#817C90',
  violet: '#7856E8',
  turquoise: '#45C7B8',
  coral: '#FF806E',
  gold: '#FFC857',
  green: '#50B98A',
  red: '#E56B72',
} as const;

/** Rôles : c'est ce que les écrans utilisent, jamais la palette brute. */
export const colors = {
  background: palette.cream,
  surfaceAlt: palette.sand,
  card: palette.white,
  text: palette.ink,
  textMuted: palette.inkSoft,
  border: '#ECE5DA',

  /** Progression et actions principales. */
  primary: palette.violet,
  primarySoft: '#EEE8FD',
  /** Habitudes et objectifs. */
  habit: palette.turquoise,
  habitSoft: '#E1F6F3',
  /** Récompenses. */
  reward: palette.gold,
  rewardSoft: '#FFF3D6',
  rewardInk: '#8A5A00',
  /** Quêtes et découvertes. */
  quest: palette.coral,
  questSoft: '#FFE9E5',
  /** Réussites financières. */
  success: palette.green,
  successSoft: '#E3F4EC',
  /** Alertes uniquement. */
  alert: palette.red,
  alertSoft: '#FBE6E7',

  /** Marquage des données fictives. */
  demo: '#5B4FB0',
  demoSoft: '#ECE9FB',
  onPrimary: palette.white,
} as const;

export type ColorRole = keyof typeof colors;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const fonts = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.displaySemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
  number: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#28243A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#4A2FB8',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

/** Couleurs des catégories de dépenses (graphiques). */
export const categoryColors: Record<string, string> = {
  groceries: '#50B98A',
  restaurants: '#FF806E',
  transport: '#45C7B8',
  housing: '#7856E8',
  subscriptions: '#B48CF2',
  shopping: '#FFC857',
  leisure: '#F59BB8',
  health: '#5BA8E8',
  income: '#50B98A',
  savings_transfers: '#9AA0B5',
  other: '#C9C2B6',
};
