// Design system VAULT — thème « arcade néon » : fond sombre teinté de vert, vert néon pour l'action,
// couleurs franches par rôle, titres très épais en capitales, chiffres en police à chasse fixe.
// Les écrans n'utilisent que les rôles ci-dessous, jamais la palette brute.

export const palette = {
  night: '#0D100B',
  moss: '#151912',
  mossHigh: '#1E241A',
  line: '#2A3224',
  bone: '#F2F5EC',
  fog: '#98A28F',
  neon: '#3FE84E',
  cyan: '#3BC8EA',
  gold: '#FFD23F',
  pink: '#FF55D2',
  violet: '#7D5CFF',
  red: '#FF5A5F',
} as const;

/** Couleur + transparence (fond « soft » sur thème sombre). */
const soft = (hex: string, alpha = '26') => `${hex}${alpha}`;

export const colors = {
  background: palette.night,
  surfaceAlt: palette.mossHigh,
  card: palette.moss,
  cardHigh: palette.mossHigh,
  text: palette.bone,
  textMuted: palette.fog,
  border: palette.line,

  /** Progression et actions principales. */
  primary: palette.neon,
  primarySoft: soft(palette.neon),
  /** Habitudes et objectifs. */
  habit: palette.cyan,
  habitSoft: soft(palette.cyan),
  /** Récompenses. */
  reward: palette.gold,
  rewardSoft: soft(palette.gold),
  rewardInk: palette.gold,
  /** Quêtes et découvertes. */
  quest: palette.pink,
  questSoft: soft(palette.pink),
  /** Défis entre amis. */
  challenge: palette.violet,
  challengeSoft: soft(palette.violet, '33'),
  /** Réussites financières. */
  success: palette.neon,
  successSoft: soft(palette.neon),
  /** Alertes uniquement. */
  alert: palette.red,
  alertSoft: soft(palette.red, '29'),

  /** Marquage des données fictives. */
  demo: '#B6A2FF',
  demoSoft: soft(palette.violet, '2E'),
  /** Texte posé sur une couleur vive (vert, jaune, cyan…). */
  onPrimary: palette.night,
  onColor: palette.night,
} as const;

export type ColorRole = keyof typeof colors;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 12, md: 18, lg: 26, xl: 32, pill: 999 } as const;

export const fonts = {
  display: 'Unbounded_900Black',
  displaySemi: 'Unbounded_700Bold',
  mono: 'SpaceMono_700Bold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, textTransform: 'uppercase' as const },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, letterSpacing: -0.3, textTransform: 'uppercase' as const },
  heading: { fontFamily: fonts.displaySemi, fontSize: 14, lineHeight: 19, letterSpacing: 0.2, textTransform: 'uppercase' as const },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  number: { fontFamily: fonts.mono, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  numberXL: { fontFamily: fonts.mono, fontSize: 42, lineHeight: 48, letterSpacing: -1.5 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lifted: {
    shadowColor: palette.neon,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

/** Couleurs des catégories de dépenses (graphiques), lisibles sur fond sombre. */
export const categoryColors: Record<string, string> = {
  groceries: '#3FE84E',
  restaurants: '#FF55D2',
  transport: '#3BC8EA',
  housing: '#7D5CFF',
  subscriptions: '#B48CFF',
  shopping: '#FFD23F',
  leisure: '#FF8A5B',
  health: '#5BA8FF',
  income: '#3FE84E',
  savings_transfers: '#8E9A86',
  other: '#6F7868',
};
