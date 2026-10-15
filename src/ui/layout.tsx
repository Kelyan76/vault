import type { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, radius, space } from '@/theme/tokens';
import { useStore } from '@/store/store';
import { Icon, type IconName } from './Icon';
import { Button, IconButton, Row, T } from './primitives';
import { EmptyArt } from '@/art/EmptyArt';

/** Bandeau permanent en mode démonstration : impossible de confondre avec de vraies données. */
export function DemoBanner() {
  const { space: s, switchSpace } = useStore();
  if (s !== 'demo') return null;
  return (
    <View style={styles.demo} accessibilityRole="text" accessibilityLabel="Mode démonstration : toutes les données affichées sont fictives">
      <Icon name="info" size={16} color={colors.demo} />
      <T v="small" color={colors.demo} style={{ flex: 1 }}>
        Mode démo · données fictives
      </T>
      <Button small kind="ghost" label="Mes données" onPress={() => switchSpace('personal')} style={{ minHeight: 28, paddingHorizontal: 8 }} />
    </View>
  );
}

export function Screen({
  children,
  title,
  subtitle,
  back,
  right,
  scroll = true,
  onRefresh,
  refreshing,
  padded = true,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const header =
    title || back ? (
      <View style={{ gap: 4, marginBottom: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          {back ? <IconButton icon="left" label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : <View />}
          {right ?? <View />}
        </Row>
        {title ? (
          <T v="title" style={{ marginTop: back ? space.sm : 0 }}>
            {title}
          </T>
        ) : null}
        {subtitle ? <T color={colors.textMuted}>{subtitle}</T> : null}
      </View>
    ) : null;
  const content = (
    <>
      <DemoBanner />
      {header}
      {children}
    </>
  );
  const pad = { paddingTop: insets.top + space.sm, paddingHorizontal: padded ? space.lg : 0, paddingBottom: insets.bottom + 110 };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.background }, pad]}>{content}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[pad, { maxWidth: 640, width: '100%', alignSelf: 'center' }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {content}
    </ScrollView>
  );
}

export function EmptyState({ title, text, action, onAction, art = 'chest' }: { title: string; text: string; action?: string; onAction?: () => void; art?: 'chest' | 'quest' | 'bank' | 'friends' }) {
  return (
    <View style={styles.empty}>
      <EmptyArt kind={art} />
      <T v="heading" center>
        {title}
      </T>
      <T color={colors.textMuted} center>
        {text}
      </T>
      {action && onAction ? <Button label={action} onPress={onAction} style={{ marginTop: space.sm, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={[styles.empty, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
      <Icon name="alert" color={colors.alert} size={28} />
      <T center color={colors.text}>
        {text}
      </T>
      {onRetry ? <Button kind="secondary" label="Réessayer" icon="sync" onPress={onRetry} /> : null}
    </View>
  );
}

export function LoadingState({ text = 'Chargement…' }: { text?: string }) {
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} size="large" />
      <T color={colors.textMuted}>{text}</T>
    </View>
  );
}

/** Message de réussite ou d'erreur sous un formulaire. */
export function Notice({ tone, text, icon }: { tone: 'success' | 'alert' | 'info' | 'warning'; text: string; icon?: IconName }) {
  const map = {
    success: [colors.successSoft, colors.success, 'check'],
    alert: [colors.alertSoft, colors.alert, 'alert'],
    info: [colors.primarySoft, colors.primary, 'info'],
    warning: [colors.rewardSoft, colors.rewardInk, 'info'],
  } as const;
  const [bg, fg, ic] = map[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole={tone === 'alert' ? 'alert' : 'text'} accessibilityLiveRegion="polite">
      <Icon name={icon ?? ic} size={18} color={fg} />
      <T v="small" style={{ flex: 1 }} color={colors.text}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.demoSoft,
    borderRadius: radius.md,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.demo,
    borderStyle: 'dashed',
  },
  empty: { alignItems: 'center', gap: space.sm, padding: space.xl, backgroundColor: colors.card, borderRadius: radius.lg },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: space.sm, borderRadius: radius.md },
});
