import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { levelTitle } from '@shared/domain/xp.ts';
import { useAuth } from '@/features/auth/auth';
import { useProgress } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Avatar } from '@/art/Avatar';
import { Screen, Notice } from '@/ui/layout';
import { Icon, IconBubble, type IconName } from '@/ui/Icon';
import { Button, Card, Divider, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';

function Link({ icon, label, hint, href, color = colors.primary, bg = colors.primarySoft }: { icon: IconName; label: string; hint?: string; href: Href; color?: string; bg?: string }) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8 }, pressed && { opacity: 0.6 }]}>
      <IconBubble name={icon} color={color} bg={bg} size={38} />
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{label}</T>
        {hint ? (
          <T v="small" color={colors.textMuted}>
            {hint}
          </T>
        ) : null}
      </View>
      <Icon name="right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function Profile() {
  const { data, space: sp, switchSpace } = useStore();
  const lvl = useProgress();
  const auth = useAuth();

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Avatar id={data.profile.avatar} name={data.profile.pseudo} size={84} />
        <T v="title">{data.profile.pseudo}</T>
        <T color={colors.textMuted}>
          Niveau {lvl.level} · {levelTitle(lvl.level)} · {lvl.xp} XP
        </T>
        <Button small kind="secondary" label="Modifier le profil" icon="edit" onPress={() => router.push('/settings/profile')} />
      </Card>

      <SectionTitle title="Espace de données" />
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyStrong">{sp === 'demo' ? 'Démonstration' : 'Mes données'}</T>
          <Pill label={sp === 'demo' ? 'FICTIF' : auth.session ? 'COMPTE CONNECTÉ' : 'SUR CE TÉLÉPHONE'} color={sp === 'demo' ? colors.demo : colors.success} bg={sp === 'demo' ? colors.demoSoft : colors.successSoft} />
        </Row>
        <T v="small" color={colors.textMuted}>
          {sp === 'demo'
            ? 'Tout ce que tu vois est inventé pour la démonstration. Rien ne se mélange avec tes données.'
            : auth.session
              ? `Connecté en tant que ${auth.email}.`
              : 'Tes données sont enregistrées uniquement sur ce téléphone.'}
        </T>
        <Button kind="secondary" icon="sync" label={sp === 'demo' ? 'Passer à mes données' : 'Voir la démonstration'} onPress={() => switchSpace(sp === 'demo' ? 'personal' : 'demo')} />
      </Card>

      {sp === 'personal' ? (
        <>
          <SectionTitle title="Compte VAULT" />
          <Card style={{ gap: space.sm }}>
            {!auth.configured ? (
              <Notice tone="info" text="Le serveur VAULT (Supabase) n’est pas configuré dans cette version : création de compte et connexion bancaire réelle indisponibles. Voir docs/SETUP.md." />
            ) : auth.session ? (
              <Button kind="secondary" icon="logout" label="Se déconnecter" onPress={() => auth.signOut()} />
            ) : (
              <>
                <T v="small" color={colors.textMuted}>
                  Un compte protège tes données et permet de connecter ta banque.
                </T>
                <Row>
                  <Button label="Créer un compte" onPress={() => router.push('/auth/sign-up')} style={{ flex: 1 }} />
                  <Button kind="secondary" label="Se connecter" onPress={() => router.push('/auth/sign-in')} style={{ flex: 1 }} />
                </Row>
              </>
            )}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Progression" />
      <Card style={{ paddingVertical: space.xs }}>
        <Link icon="trophy" label="Badges" hint={`${data.achievements.length} débloqués`} href="/badges" color={colors.rewardInk} bg={colors.rewardSoft} />
        <Divider />
        <Link icon="leaf" label="Habitudes et séries" href="/habits" color={colors.habit} bg={colors.habitSoft} />
        <Divider />
        <Link icon="chart" label="Statistiques" href="/stats" />
      </Card>

      <SectionTitle title="Amis" />
      <Card style={{ paddingVertical: space.xs }}>
        <Link icon="users" label="Mes amis" hint={`${data.friends.filter((f) => f.status === 'accepted').length} amis`} href="/friends" color={colors.quest} bg={colors.questSoft} />
        <Divider />
        <Link icon="flag" label="Défis" href="/challenges" color={colors.quest} bg={colors.questSoft} />
      </Card>

      <SectionTitle title="Argent" />
      <Card style={{ paddingVertical: space.xs }}>
        <Link icon="bank" label="Connexions bancaires" href="/bank/connections" color={colors.habit} bg={colors.habitSoft} />
        <Divider />
        <Link icon="receipt" label="Toutes les opérations" href="/transactions" />
      </Card>

      <SectionTitle title="Paramètres" />
      <Card style={{ paddingVertical: space.xs }}>
        <Link icon="lock" label="Confidentialité" href="/settings/privacy" />
        <Divider />
        <Link icon="bell" label="Notifications" href="/settings/notifications" />
        <Divider />
        <Link icon="trash" label="Supprimer mon compte et mes données" href="/settings/delete-account" color={colors.alert} bg={colors.alertSoft} />
      </Card>
      <T v="small" color={colors.textMuted} center style={{ marginTop: space.lg }}>
        VAULT · version de développement. Ce n’est ni une banque ni un conseil financier.
      </T>
    </Screen>
  );
}
