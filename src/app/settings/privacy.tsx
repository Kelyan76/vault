import { Pressable, View } from 'react-native';
import { updateProfile } from '@/store/actions';
import { useStore } from '@/store/store';
import { useAuth } from '@/features/auth/auth';
import { Screen } from '@/ui/layout';
import { Icon } from '@/ui/Icon';
import { Card, Row, SectionTitle, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';

function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{label}</T>
        <T v="small" color={colors.textMuted}>
          {hint}
        </T>
      </View>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? colors.primary : colors.border, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text }} />
      </View>
    </Pressable>
  );
}

const SHARED = ['Ton pseudo et ton avatar', 'Les scores des défis que tu rejoins (nombre d’actions ou % d’un objectif)'];
const NEVER = ['Tes soldes', 'Tes opérations et leurs libellés', 'Tes dépenses, revenus et montants d’épargne', 'Tes objectifs et leurs montants', 'Tes connexions bancaires'];

export default function Privacy() {
  const { data, act, space: sp } = useStore();
  const auth = useAuth();
  return (
    <Screen back title="Confidentialité" subtitle="Ce que VAULT garde, ce que tes amis voient, et ce qu’ils ne verront jamais.">
      <Card style={{ gap: space.md }}>
        <Toggle
          value={data.profile.shareInChallenges}
          onChange={(v) => act((d, env) => updateProfile(d, { shareInChallenges: v }, env))}
          label="Partager mes scores dans les défis"
          hint="Désactivé, tu apparais avec un score de 0 dans les défis."
        />
      </Card>

      <SectionTitle title="Visible par tes amis" />
      <Card style={{ gap: 8 }}>
        {SHARED.map((s) => (
          <Row key={s}>
            <Icon name="eye" size={18} color={colors.habit} />
            <T v="small" style={{ flex: 1 }}>
              {s}
            </T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Jamais partagé" />
      <Card style={{ gap: 8 }}>
        {NEVER.map((s) => (
          <Row key={s}>
            <Icon name="lock" size={18} color={colors.primary} />
            <T v="small" style={{ flex: 1 }}>
              {s}
            </T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Où sont tes données ?" />
      <Card style={{ gap: 8 }}>
        <T v="small">
          {sp === 'demo'
            ? 'Espace démo : données fictives stockées sur ce téléphone.'
            : auth.session
              ? 'Ton compte : données stockées chez Supabase (base PostgreSQL), protégées par des règles d’accès par utilisateur (Row Level Security). Les données bancaires sont écrites uniquement par le serveur.'
              : 'Sur ce téléphone uniquement. Désinstaller l’appli les efface.'}
        </T>
        <T v="small" color={colors.textMuted}>
          VAULT ne vend pas tes données et ne s’en sert pas pour de la publicité. Les journaux techniques ne contiennent ni montants, ni libellés, ni identifiants bancaires.
        </T>
        <T v="small" color={colors.textMuted}>
          La politique de confidentialité complète et les mentions légales seront publiées avant toute mise en production.
        </T>
      </Card>
    </Screen>
  );
}
