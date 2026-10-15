import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/store/store';
import { Icon, type IconName } from '@/ui/Icon';
import { colors, fonts, radius, shadow } from '@/theme/tokens';
import type { ComponentProps } from 'react';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Accueil', icon: 'home' },
  { name: 'budget', label: 'Budget', icon: 'budget' },
  { name: 'quests', label: 'Quêtes', icon: 'flag' },
  { name: 'vault', label: 'Coffre', icon: 'vault' },
  { name: 'profile', label: 'Profil', icon: 'user' },
];

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function VaultTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.item, focused ? styles.itemActive : styles.itemIdle]}
            >
              <Icon name={tab.icon} size={20} color={focused ? colors.onPrimary : colors.text} strokeWidth={2.4} />
              {focused ? <Text style={styles.label}>{tab.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { meta } = useStore();
  if (!meta.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }} tabBar={(props) => <VaultTabBar {...props} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    ...shadow.card,
  },
  item: { height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  itemActive: { flexGrow: 1, flexBasis: 0, minWidth: 104, backgroundColor: colors.primary, paddingHorizontal: 12 },
  itemIdle: { width: 48, backgroundColor: colors.cardHigh },
  label: { fontFamily: fonts.displaySemi, fontSize: 12, color: colors.onPrimary, textTransform: 'uppercase', letterSpacing: 0.3 },
});
