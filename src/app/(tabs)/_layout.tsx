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
              style={styles.item}
            >
              <View style={[styles.iconWrap, focused && { backgroundColor: colors.primarySoft }]}>
                <Icon name={tab.icon} size={21} color={focused ? colors.primary : colors.textMuted} strokeWidth={focused ? 2.3 : 2} />
              </View>
              <Text style={[styles.label, { color: focused ? colors.primary : colors.textMuted }]}>{tab.label}</Text>
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
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: 8,
    paddingHorizontal: 6,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    ...shadow.lifted,
    shadowOpacity: 0.12,
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  iconWrap: { width: 46, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bodySemi, fontSize: 11 },
});
