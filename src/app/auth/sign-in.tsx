import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth, validateEmail } from '@/features/auth/auth';
import { Screen, Notice } from '@/ui/layout';
import { Button, Field } from '@/ui/primitives';
import { space } from '@/theme/tokens';

export default function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'alert' | 'success'; text: string } | null>(null);

  if (!auth.configured) {
    return (
      <Screen back title="Connexion">
        <Notice tone="info" text="Le serveur VAULT n’est pas configuré dans cette version : la connexion à un compte est indisponible. Tes données restent sur ce téléphone." />
      </Screen>
    );
  }

  async function submit() {
    const e = validateEmail(email);
    if (e) return setMsg({ tone: 'alert', text: e });
    setBusy(true);
    const err = await auth.signIn(email, password);
    setBusy(false);
    if (err) return setMsg({ tone: 'alert', text: err });
    router.replace('/');
  }

  return (
    <Screen back title="Connexion" subtitle="Retrouve ton compte VAULT.">
      <View style={{ gap: space.md }}>
        <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
        {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
        <Button label="Se connecter" loading={busy} onPress={submit} />
        <Button
          kind="ghost"
          label="Mot de passe oublié"
          onPress={async () => {
            const e = validateEmail(email);
            if (e) return setMsg({ tone: 'alert', text: 'Saisis ton e-mail, puis appuie sur « Mot de passe oublié ».' });
            const err = await auth.resetPassword(email);
            setMsg(err ? { tone: 'alert', text: err } : { tone: 'success', text: 'Si un compte existe pour cet e-mail, un lien de réinitialisation vient d’être envoyé.' });
          }}
        />
        <Button kind="ghost" label="Créer un compte" onPress={() => router.replace('/auth/sign-up')} />
      </View>
    </Screen>
  );
}
