import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTransactions } from '@/store/hooks';
import { useBank, ACCOUNT_TYPE_LABELS } from '@/features/bank/useBank';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { EmptyArt } from '@/art/EmptyArt';
import { Screen, ErrorState, LoadingState, Notice } from '@/ui/layout';
import { Button, Card, Pill, PopIn, Row, SectionTitle, T } from '@/ui/primitives';
import { money, relativeTime } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

/** Retour du parcours prestataire : confirmation, synchronisation initiale, comptes et dernières opérations. */
export default function BankCallback() {
  const params = useLocalSearchParams<{ status?: string; demo?: string }>();
  const bank = useBank();
  const txs = useTransactions();
  const status = params.status ?? 'error';

  if (status !== 'success') {
    const text =
      status === 'cancelled'
        ? 'Tu as quitté le parcours avant la fin. Aucune connexion n’a été créée.'
        : status === 'expired'
          ? 'Ce lien de retour a expiré ou a déjà été utilisé. Relance la connexion.'
          : status === 'not_configured'
            ? 'Le prestataire bancaire n’est pas configuré sur le serveur.'
            : 'La connexion n’a pas pu être vérifiée. Aucune donnée n’a été importée.';
    return (
      <Screen back title="Connexion bancaire">
        <ErrorState text={text} onRetry={() => router.replace('/bank')} />
      </Screen>
    );
  }

  const live = bank.connections.filter((c) => !c.disconnectedAt);
  const demo = bank.source === 'demo';
  return (
    <Screen title={demo ? 'Banque fictive connectée' : 'Banque connectée'}>
      {demo ? <Notice tone="warning" text="Connexion de démonstration : les comptes et opérations ci-dessous sont fictifs." /> : null}
      <PopIn>
        <View style={{ alignItems: 'center', marginVertical: space.md }}>
          <EmptyArt kind="bank" />
        </View>
      </PopIn>
      {bank.loading ? <LoadingState text="Synchronisation initiale en cours…" /> : null}
      {bank.error ? <ErrorState text={bank.error} onRetry={bank.reload} /> : null}

      <SectionTitle title="Comptes disponibles" />
      {bank.accounts.length === 0 && !bank.loading ? (
        <Card>
          <T color={colors.textMuted}>La synchronisation initiale peut prendre quelques minutes. Tu peux suivre son état dans « Connexions bancaires ».</T>
        </Card>
      ) : (
        <Card style={{ gap: 10 }}>
          {bank.accounts.map((a) => (
            <Row key={a.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{a.name}</T>
                <T v="small" color={colors.textMuted}>
                  {ACCOUNT_TYPE_LABELS[a.type]}
                  {a.ibanLast4 ? ` · •••• ${a.ibanLast4}` : ''}
                  {a.currency ? ` · ${a.currency}` : ''}
                </T>
              </View>
              <T v="bodyStrong">{a.balanceMinor !== null && a.currency ? money(a.balanceMinor, a.currency) : 'Solde indisponible'}</T>
            </Row>
          ))}
          {live[0] ? (
            <Row gap={6}>
              <Pill label="SYNCHRONISÉ" color={colors.success} bg={colors.successSoft} icon="check" />
              <T v="small" color={colors.textMuted}>
                {relativeTime(live[0].lastSyncAt)}
              </T>
            </Row>
          ) : null}
        </Card>
      )}

      {demo ? (
        <>
          <SectionTitle title="Dernières opérations" />
          <Card style={{ paddingVertical: space.xs }}>
            {txs.filter((t) => t.source !== 'manual').slice(0, 5).map((t) => (
              <TransactionRow key={t.id} tx={t} />
            ))}
          </Card>
        </>
      ) : null}

      <Button label="C’est parti" icon="right" style={{ marginTop: space.lg }} onPress={() => router.replace('/')} />
      <Button kind="ghost" label="Gérer mes connexions" onPress={() => router.replace('/bank/connections')} />
    </Screen>
  );
}
