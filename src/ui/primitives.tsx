import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow, space, type } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type TextVariant = keyof typeof type;

export function T({ children, v = 'body', color, style, center, numberOfLines }: { children: ReactNode; v?: TextVariant; color?: string; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[type[v], { color: color ?? colors.text }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, tone, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: string; onPress?: () => void; accessibilityLabel?: string }) {
  const body = <View style={[styles.card, tone ? { backgroundColor: tone } : null, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // La carte cliquable garde la place que lui donne sa mise en page (ex. flex: 1 dans une rangée).
      style={({ pressed }) => [{ flex: StyleSheet.flatten(style)?.flex }, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }]}
    >
      {body}
    </Pressable>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'reward';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.card, fg: colors.primary, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary },
    danger: { bg: colors.alertSoft, fg: colors.alert },
    reward: { bg: colors.reward, fg: colors.onColor },
  };
  const p = palette[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: p.bg, borderColor: p.border ?? 'transparent', opacity: disabled ? 0.45 : 1 },
        kind === 'primary' && !disabled && shadow.lifted,
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : icon ? <Icon name={icon} size={small ? 16 : 19} color={p.fg} /> : null}
      <Text style={[small ? type.small : type.bodyStrong, { color: p.fg, fontFamily: small ? fonts.bodyBold : fonts.displaySemi, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: small ? 12 : 14 }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.text, bg = colors.card }: { icon: IconName; onPress: () => void; label: string; color?: string; bg?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.iconButton, { backgroundColor: bg }, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}

/** Jauge animée : la progression glisse jusqu'à sa valeur. */
export function ProgressBar({ value, color = colors.primary, track = colors.primarySoft, height = 10, label }: { value: number; color?: string; track?: string; height?: number; label?: string }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 700 });
  }, [value, v]);
  const style = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.max(0, Math.min(1, value)) * 100) }}
      style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color }, style]} />
    </View>
  );
}

export function Pill({ label, color, bg, icon }: { label: string; color: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={13} color={color} strokeWidth={2.4} /> : null}
      <Text style={[type.tiny, { color }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, color = colors.primary }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: color, borderColor: color } : { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={[type.small, { color: selected ? colors.onPrimary : colors.text, fontFamily: fonts.bodySemi }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <T v="heading">{title}</T>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T v="small" color={colors.primary} style={{ fontFamily: fonts.bodyBold }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bodySemi }}>
        {label}
      </T>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, error ? { borderColor: colors.alert } : null, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]}
      />
      {error ? (
        <T v="small" color={colors.alert}>
          {error}
        </T>
      ) : hint ? (
        <T v="small" color={colors.textMuted}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />;
}

/** Petit rebond d'apparition pour les éléments gagnés. */
export function PopIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const s = useSharedValue(0.6);
  const o = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(() => {
      s.value = withSpring(1, { damping: 11, stiffness: 160 });
      o.value = withTiming(1, { duration: 220 });
    }, delay);
    return () => clearTimeout(t);
  }, [delay, s, o]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: o.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border },
  button: { minHeight: 54, borderRadius: radius.pill, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderWidth: 1 },
  buttonSmall: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.pill },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 13,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.text,
  },
});
