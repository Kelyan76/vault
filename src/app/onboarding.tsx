import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { validatePseudo } from '@shared/domain/challenges.ts';
import { Chest } from '@/art/Chest';
import { Avatar, AVATARS, avatarLabel } from '@/art/Avatar';
import { EmptyArt } from '@/art/EmptyArt';
import { useStore } from '@/store/store';
import { updateProfile } from '@/store/actions';
import { useAuth } from '@/features/auth/auth';
import { Button, Field, PopIn, T } from '@/ui/primitives';
import { colors, radius, space } from '@/theme/tokens';
import type { Avatar as AvatarId } from '@/store/types';

const SLIDES = [
  {
    art: 'chest' as const,
    kicker: 'BIENVENUE DANS VAULT',
    title: 'Ton argent, en mode progression',
    text: 'Des quêtes, des objectifs et un coffre qui grandit avec tes efforts. Ce qui compte : ta régularité, pas le montant sur ton compte.',
  },
  {
    art: 'quest' as const,
    kicker: 'QUÊTES ET HABITUDES',
    title: 'De petites actions, de vrais progrès',
    text: 'Analyse tes dépenses, tiens un budget, mets 10 € de côté : chaque action validée rapporte de l’XP. Une journée manquée ? Aucun souci.',
  },
  {
    art: 'bank' as const,
    kicker: 'PRIVÉ PAR DÉFAUT',
    title: 'Tes chiffres restent à toi',
    text: 'Connexion bancaire via un prestataire agréé, sans jamais saisir ton mot de passe dans VAULT. Tes amis voient tes scores, jamais tes soldes ni tes opérations.',
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { setMeta, switchSpace, actOn } = useStore();
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [pseudo, setPseudo] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>('fox');
  const [error, setError] = useState<string | null>(null);
  const last = step === SLIDES.length;

  function startDemo() {
    switchSpace('demo');
    setMeta({ onboarded: true });
    router.replace('/');
  }

  function startPersonal() {
    const err = validatePseudo(pseudo);
    if (err) return setError(err);
    actOn('personal', (d, env) => updateProfile(d, { pseudo, avatar }, env));
    switchSpace('personal');
    setMeta({ onboarded: true });
    router.replace('/');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl, flexGrow: 1, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      {!last ? (
        <View style={{ flex: 1, justifyContent: 'space-between', gap: space.xl }}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && { width: 26, backgroundColor: colors.primary }]} />
            ))}
          </View>
          <PopIn key={step}>
            <View style={styles.hero}>
              {SLIDES[step].art === 'chest' ? <Chest stage={3} size={1.05} /> : <EmptyArt kind={SLIDES[step].art} />}
            </View>
          </PopIn>
          <View style={{ gap: space.sm }}>
            <T v="tiny" color={colors.quest}>
              {SLIDES[step].kicker}
            </T>
            <T v="hero">{SLIDES[step].title}</T>
            <T color={colors.textMuted}>{SLIDES[step].text}</T>
          </View>
          <View style={{ gap: space.sm }}>
            <Button label={step === SLIDES.length - 1 ? 'Commencer' : 'Suivant'} icon="right" onPress={() => setStep(step + 1)} />
            <Button kind="ghost" label="Passer" onPress={() => setStep(SLIDES.length)} />
          </View>
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <T v="hero">Comment veux-tu commencer ?</T>
          <View style={styles.choice}>
            <T v="tiny" color={colors.demo}>
              SANS ENGAGEMENT
            </T>
            <T v="heading">Explorer la démo</T>
            <T color={colors.textMuted}>Une banque fictive, des quêtes et un coffre d’exemple. Tout est clairement marqué « démo » et reste séparé de tes données.</T>
            <Button kind="secondary" label="Voir la démo" icon="eye" onPress={startDemo} />
          </View>
          <View style={[styles.choice, { borderColor: colors.primary }]}>
            <T v="tiny" color={colors.primary}>
              MES DONNÉES
            </T>
            <T v="heading">Créer mon profil</T>
            <Field label="Pseudo (visible par tes amis)" value={pseudo} onChangeText={(t) => { setPseudo(t); setError(null); }} placeholder="ex. Camille_76" autoCapitalize="none" error={error} maxLength={20} />
            <T v="small" color={colors.textMuted}>
              Avatar
            </T>
            <View style={styles.avatars}>
              {AVATARS.map((a) => (
                <Pressable key={a} onPress={() => setAvatar(a)} accessibilityRole="radio" accessibilityState={{ selected: avatar === a }} accessibilityLabel={avatarLabel(a)}>
                  <Avatar id={a} size={52} ring={avatar === a ? colors.primary : undefined} />
                </Pressable>
              ))}
            </View>
            <Button label="Commencer" icon="right" onPress={startPersonal} />
            <T v="small" color={colors.textMuted}>
              {auth.configured
                ? 'Tes données restent sur ce téléphone tant que tu ne crées pas de compte. Tu pourras en créer un depuis ton profil.'
                : 'Tes données restent sur ce téléphone. Le compte en ligne et la connexion bancaire seront disponibles une fois le serveur VAULT configuré.'}
            </T>
          </View>
          {auth.configured ? <Button kind="ghost" label="J’ai déjà un compte" onPress={() => { setMeta({ onboarded: true }); switchSpace('personal'); router.replace('/auth/sign-in'); }} /> : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DDD5C8' },
  hero: { alignItems: 'center', justifyContent: 'center', minHeight: 230, backgroundColor: colors.card, borderRadius: radius.xl, paddingVertical: space.lg },
  choice: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1.5, borderColor: colors.border },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
