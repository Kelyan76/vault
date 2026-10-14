import { Pressable, View } from 'react-native';
import { updateProfile } from '@/store/actions';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Card, Divider, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';
import type { Profile } from '@/store/types';

const ITEMS: { key: keyof Profile['notifications']; label: string; hint: string }[] = [
  { key: 'quests', label: 'Quêtes', hint: 'Quand une quête est prête à être validée ou se termine bientôt.' },
  { key: 'weeklyReview', label: 'Bilan de la semaine', hint: 'Un rappel doux le dimanche soir.' },
  { key: 'sync', label: 'Connexion bancaire', hint: 'Quand ta banque demande de renouveler ton consentement ou une action.' },
  { key: 'challenges', label: 'Défis entre amis', hint: 'Invitations et résultats des défis.' },
];

export default function Notifications() {
  const { data, act } = useStore();
  return (
    <Screen back title="Notifications" subtitle="Peu de messages, seulement les utiles. Jamais de culpabilisation.">
      <Notice tone="info" text="Préférences enregistrées. L’envoi des notifications sur le téléphone (expo-notifications) n’est pas encore branché dans cette version." />
      <Card style={{ marginTop: space.md }}>
        {ITEMS.map((it, i) => {
          const on = data.profile.notifications[it.key];
          return (
            <View key={it.key}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={it.label}
                onPress={() => act((d, env) => updateProfile(d, { notifications: { ...d.profile.notifications, [it.key]: !on } }, env))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8 }}
              >
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{it.label}</T>
                  <T v="small" color={colors.textMuted}>
                    {it.hint}
                  </T>
                </View>
                <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? colors.primary : colors.border, padding: 3, alignItems: on ? 'flex-end' : 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
