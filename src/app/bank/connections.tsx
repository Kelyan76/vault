import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { STATUS_COPY } from '@shared/banking/status.ts';
import { disconnectDemoBank, syncDemoBank } from '@/store/actions';
import { useStore } from '@/store/store';
import { useBank, ACCOUNT_TYPE_LABELS, type BankConnectionView } from '@/features/bank/useBank';
import { CONSENT_VERSION } from '@/features/bank/consent';
import { bankReturnUrl, openProviderFlow } from '@/features/bank/openProvider';
import { BackendError, callFunction } from '@/lib/supabase';
import { Screen, EmptyState, ErrorState, LoadingState, Notice } from '@/ui/layout';
import { IconBubble } from '@/ui/Icon';
import { Button, Card, Divider, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { money, relativeTime, shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

const TONE = {
  neutral: [colors.textMuted, colors.surfaceAlt],
  progress: [colors.primary, colors.primarySoft],
  success: [colors.success, colors.successSoft],
  warning: [colors.rewardInk, colors.rewardSoft],
  alert: [colors.alert, colors.alertSoft],
} as const;

function ConnectionCard({ c }: { c: BankConnectionView }) {
  const bank = useBank();
  const { act, data } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'alert' | 'info'; text: string } | null>(null);
  const copy = STATUS_COPY[c.status];
  const [fg, bg] = TONE[copy.tone];
  const accounts = bank.accounts.filter((a) => a.connectionId === c.id);
  const jobs = c.demo ? data.bank.syncJobs.filter((j) => j.connectionId === c.id).slice(-3).reverse() : [];
  const activeBankQuests = data.userQuests.filter((q) => q.status === 'active' && (q.questId === 'q-delivery-down' || q.questId === 'q-leisure-budget')).length;

  async function sync() {
    setMsg(null);
    if (c.demo) {
      const err = act((d, env) => syncDemoBank(d, env));
      return setMsg(err ? { tone: 'alert', text: err } : { tone: 'success', text: 'Synchronisation terminée (banque fictive).' });
    }
    setBusy(true);
    try {
      const r = await callFunction<{ kind: string }>('bank-sync', { connectionId: c.id });
      setMsg({ tone: r.kind === 'succeeded' ? 'success' : 'info', text: r.kind === 'succeeded' ? 'Synchronisation terminée.' : 'Synchronisation non effectuée : vérifie l’état de la connexion.' });
      bank.reload();
    } catch (e) {
      setMsg({ tone: 'alert', text: e instanceof BackendError && e.code === 'too_soon' ? 'Une synchronisation a eu lieu il y a moins de 5 minutes.' : 'La synchronisation a échoué. Réessaie plus tard.' });
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    setBusy(true);
    try {
      const returnUrl = bankReturnUrl();
      const { url } = await callFunction<{ url: string }>('bank-connect', { consentAccepted: true, consentVersion: CONSENT_VERSION, connectionId: c.id, returnUrl });
      const res = await openProviderFlow(url, returnUrl);
      if (res.type === 'success') bank.reload();
    } catch {
      setMsg({ tone: 'alert', text: 'Impossible d’ouvrir le parcours de renouvellement.' });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(deleteData: boolean) {
    setMsg(null);
    if (c.demo) {
      act((d, env) => disconnectDemoBank(d, deleteData, env));
      setConfirm(false);
      return;
    }
    setBusy(true);
    try {
      await callFunction('bank-disconnect', { connectionId: c.id, deleteData });
      setConfirm(false);
      bank.reload();
    } catch {
      setMsg({ tone: 'alert', text: 'La révocation chez le prestataire a échoué : la connexion reste active. Réessaie.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: space.sm }}>
      <Row>
        <IconBubble name="bank" color={colors.habit} bg={colors.habitSoft} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{c.institution}</T>
          <T v="small" color={colors.textMuted}>
            Dernière synchronisation : {relativeTime(c.lastSyncAt)}
          </T>
        </View>
        {c.demo ? <Pill label="FICTIVE" color={colors.demo} bg={colors.demoSoft} /> : null}
      </Row>
      <View style={{ backgroundColor: bg, padding: space.sm, borderRadius: 12, gap: 2 }}>
        <T v="bodyStrong" color={fg}>
          {copy.title}
        </T>
        <T v="small">{copy.explanation}</T>
        {c.consentExpiresAt && !c.disconnectedAt ? (
          <T v="small" color={colors.textMuted}>
            Consentement valable jusqu’au {shortDate(c.consentExpiresAt)}
          </T>
        ) : null}
      </View>

      {accounts.map((a) => (
        <Row key={a.id} style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T v="small">{a.name}</T>
            <T v="small" color={colors.textMuted}>
              {ACCOUNT_TYPE_LABELS[a.type]}
              {a.currency ? ` · ${a.currency}` : ''}
            </T>
          </View>
          <T v="small">{a.balanceMinor !== null && a.currency ? money(a.balanceMinor, a.currency) : 'Solde indisponible'}</T>
        </Row>
      ))}

      {jobs.length ? (
        <>
          <Divider />
          <T v="small" color={colors.textMuted}>
            Historique de synchronisation
          </T>
          {jobs.map((j) => (
            <T key={j.id} v="small" color={colors.textMuted}>
              {relativeTime(j.at)} · {j.status === 'succeeded' ? 'réussie' : 'échec'} · {j.inserted} nouvelles, {j.updated} mises à jour, {j.removed} retirées
            </T>
          ))}
        </>
      ) : null}

      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}

      {!c.disconnectedAt ? (
        <>
          <Row>
            <Button small kind="secondary" icon="sync" label="Synchroniser" loading={busy} onPress={sync} style={{ flex: 1 }} />
            {!c.demo && (c.status === 'consent_expired' || c.status === 'action_required') ? <Button small label={copy.action ?? 'Résoudre'} onPress={renew} style={{ flex: 1 }} /> : null}
          </Row>
          {!confirm ? (
            <Button small kind="ghost" label="Déconnecter cette banque" onPress={() => setConfirm(true)} />
          ) : (
            <Card tone={colors.alertSoft} style={{ gap: space.sm }}>
              <T v="bodyStrong">Déconnecter {c.institution} ?</T>
              <T v="small">
                L’accès sera révoqué chez le prestataire : plus aucune nouvelle opération ne sera importée.
                {activeBankQuests ? ` ${activeBankQuests} quête(s) en cours ne pourront plus être vérifiées automatiquement (tu pourras les déclarer).` : ''} Tes objectifs, ton coffre et ton XP restent intacts.
              </T>
              <Button small kind="danger" label="Révoquer et garder l’historique importé" loading={busy} onPress={() => disconnect(false)} />
              <Button small kind="danger" label="Révoquer et supprimer les données importées" loading={busy} onPress={() => disconnect(true)} />
              <T v="small" color={colors.textMuted}>
                Supprimer efface les comptes, opérations et corrections de catégorie liés à cette banque. Les sommes déjà confirmées dans le coffre restent, sans lien avec l’opération.
              </T>
              <Button small kind="ghost" label="Annuler" onPress={() => setConfirm(false)} />
            </Card>
          )}
        </>
      ) : (
        <T v="small" color={colors.textMuted}>
          Déconnectée le {shortDate(c.disconnectedAt)}.
        </T>
      )}
    </Card>
  );
}

export default function Connections() {
  const bank = useBank();
  const live = bank.connections.filter((c) => !c.disconnectedAt);
  const past = bank.connections.filter((c) => c.disconnectedAt);
  return (
    <Screen back title="Connexions bancaires" subtitle="État, synchronisation et révocation de tes accès." onRefresh={bank.source === 'server' ? bank.reload : undefined} refreshing={bank.loading}>
      {bank.source === 'unavailable' ? <Notice tone="info" text={bank.unavailableReason!} /> : null}
      {bank.loading ? <LoadingState /> : null}
      {bank.error ? <ErrorState text={bank.error} onRetry={bank.reload} /> : null}
      {!bank.loading && live.length === 0 ? (
        <View style={{ marginTop: space.md }}>
          <EmptyState art="bank" title="Aucune banque connectée" text="Tu peux en connecter une, ou continuer en saisie manuelle." action={bank.source === 'unavailable' ? undefined : 'Connecter ma banque'} onAction={() => router.push('/bank')} />
        </View>
      ) : (
        <View style={{ gap: space.md, marginTop: space.sm }}>
          {live.map((c) => (
            <ConnectionCard key={c.id} c={c} />
          ))}
        </View>
      )}
      {past.length ? (
        <>
          <SectionTitle title="Anciennes connexions" />
          <View style={{ gap: space.sm }}>
            {past.map((c) => (
              <ConnectionCard key={c.id} c={c} />
            ))}
          </View>
        </>
      ) : null}
      {live.length > 0 && bank.source !== 'unavailable' ? <Button kind="secondary" icon="plus" label="Ajouter une autre banque" style={{ marginTop: space.lg }} onPress={() => router.push('/bank')} /> : null}
    </Screen>
  );
}
