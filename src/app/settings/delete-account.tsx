import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/auth';
import { callFunction } from '@/lib/supabase';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Button, Card, Field, SectionTitle, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';

export default function DeleteAccount() {
  const auth = useAuth();
  const { resetSpace, setMeta, switchSpace } = useStore();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = confirm.trim().toUpperCase() === 'SUPPRIMER';

  async function deleteServerAccount() {
    setBusy(true);
    setMsg(null);
    try {
      await callFunction('delete-account', { confirm: 'SUPPRIMER' });
      await auth.signOut();
      wipeLocal();
    } catch {
      setMsg('La suppression a échoué (révocation bancaire ou serveur). Rien n’a été supprimé côté serveur ; réessaie ou contacte le support.');
    } finally {
      setBusy(false);
    }
  }

  function wipeLocal() {
    resetSpace('personal');
    resetSpace('demo');
    switchSpace('demo');
    setMeta({ onboarded: false });
    router.replace('/onboarding');
  }

  return (
    <Screen back title="Supprimer mon compte" subtitle="Action définitive. Prends le temps de lire.">
      <Card style={{ gap: 8 }}>
        <T v="bodyStrong">Ce qui sera supprimé</T>
        <T v="small">• Tes connexions bancaires : l’accès est d’abord révoqué chez le prestataire, qui supprime aussi ses données te concernant.</T>
        <T v="small">• Comptes et opérations importés, saisies manuelles, corrections de catégorie.</T>
        <T v="small">• Budgets, objectifs, coffre, dépenses évitées, habitudes, quêtes, XP et badges.</T>
        <T v="small">• Ton profil, tes amitiés et ta participation aux défis.</T>
        <T v="small" color={colors.textMuted}>
          Seul subsiste un journal d’audit technique anonymisé (type d’action et date, sans lien avec toi), pour la sécurité du service.
        </T>
      </Card>

      <SectionTitle title="Confirmer" />
      <View style={{ gap: space.md }}>
        <Field label="Écris SUPPRIMER pour confirmer" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
        {msg ? <Notice tone="alert" text={msg} /> : null}
        {auth.session ? (
          <Button kind="danger" icon="trash" label="Supprimer définitivement mon compte" disabled={!ok} loading={busy} onPress={deleteServerAccount} />
        ) : (
          <>
            <Notice tone="info" text="Tu n’as pas de compte en ligne : seules les données de ce téléphone (espace personnel et démo) seront effacées." />
            <Button kind="danger" icon="trash" label="Effacer les données de ce téléphone" disabled={!ok} onPress={wipeLocal} />
          </>
        )}
      </View>
    </Screen>
  );
}
