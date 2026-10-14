import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { validatePseudo } from '@shared/domain/challenges.ts';
import { useAuth, validateEmail, validatePassword } from '@/features/auth/auth';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Button, Field, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';

export default function SignUp() {
  const auth = useAuth();
  const { data } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState(data.profile.pseudo === 'joueur' ? '' : data.profile.pseudo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'alert' | 'success'; text: string } | null>(null);

  if (!auth.configured) {
    return (
      <Screen back title="Créer un compte">
        <Notice tone="info" text="Le serveur VAULT n’est pas configuré dans cette version : la création de compte est indisponible. Voir docs/SETUP.md pour le configurer." />
      </Screen>
    );
  }

  async function submit() {
    const err = validatePseudo(pseudo) ?? validateEmail(email) ?? validatePassword(password);
    if (err) return setMsg({ tone: 'alert', text: err });
    setBusy(true);
    const r = await auth.signUp(email, password, pseudo);
    setBusy(false);
    if (r.error) return setMsg({ tone: 'alert', text: r.error });
    if (r.needsConfirmation) return setMsg({ tone: 'success', text: 'Compte créé. Confirme ton adresse grâce à l’e-mail reçu (pense aux spams), puis connecte-toi.' });
    router.replace('/');
  }

  return (
    <Screen back title="Créer un compte" subtitle="Pour protéger tes données et connecter ta banque.">
      <View style={{ gap: space.md }}>
        <Field label="Pseudo (visible par tes amis)" value={pseudo} onChangeText={setPseudo} autoCapitalize="none" maxLength={20} />
        <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="10 caractères minimum, lettres et chiffres." />
        {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
        <Button label="Créer mon compte" loading={busy} onPress={submit} />
        <T v="small" color={colors.textMuted}>
          Les données saisies sur ce téléphone avant la création du compte y restent : leur transfert vers ton compte sera proposé dans une prochaine version.
        </T>
        <Button kind="ghost" label="J’ai déjà un compte" onPress={() => router.replace('/auth/sign-in')} />
      </View>
    </Screen>
  );
}
