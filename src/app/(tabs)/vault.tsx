import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { estimatedSaving, savingsTransferSuggestions, vaultStage, vaultTotals } from '@shared/domain/savings.ts';
import { confirmSavingsTransfer, emptyVault } from '@/store/actions';
import { useGoals, useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { GOAL_ICONS } from '@/features/vault/goalIcons';
import { Chest } from '@/art/Chest';
import { Screen, EmptyState, Notice } from '@/ui/layout';
import { IconBubble } from '@/ui/Icon';
import { Button, Card, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { money, shortDate } from '@/ui/format';
import { colors, radius, space } from '@/theme/tokens';

export default function Vault() {
  const { data, act } = useStore();
  const goals = useGoals();
  const txs = useTransactions();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const cur = data.profile.currency;
  const totals = vaultTotals(data.entries)[cur] ?? { declaredMinor: 0, observedMinor: 0 };
  const suggestions = useMemo(() => savingsTransferSuggestions(txs, data.entries).slice(0, 3), [txs, data.entries]);
  const stage = vaultStage(goals);
  const estimated = data.avoided.reduce((s, a) => s + estimatedSaving(a), 0);

  return (
    <Screen title="Mon coffre" subtitle="Un outil de suivi : il représente tes économies, il ne détient aucun argent.">
      <Card style={{ alignItems: 'center', gap: space.sm, paddingTop: space.xl }}>
        <Chest stage={stage} size={1.1} celebrate={data.entries.length} />
        <T v="small" color={colors.textMuted}>
          Suivi dans ton coffre
        </T>
        <T v="hero">{money(totals.declaredMinor + totals.observedMinor, cur)}</T>
        <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill label={`DÉCLARÉ ${money(totals.declaredMinor, cur)}`} color={colors.primary} bg={colors.primarySoft} />
          <Pill label={`VIREMENTS CONFIRMÉS ${money(totals.observedMinor, cur)}`} color={colors.habit} bg={colors.habitSoft} />
        </Row>
        <Row style={{ marginTop: space.sm, alignSelf: 'stretch' }}>
          <Button label="Mettre de côté" icon="coin" onPress={() => router.push('/savings/new')} style={{ flex: 1 }} />
          <Button kind="secondary" label="Objectif" icon="plus" onPress={() => router.push('/goals/new')} style={{ flex: 1 }} />
        </Row>
        <T v="small" color={colors.textMuted} center>
          Ce que tu mets de côté ici est retiré de ta prévision de fin de mois : tu vois ce qu’il te reste vraiment.
        </T>
        {totals.declaredMinor + totals.observedMinor > 0 ? (
          confirmEmpty ? (
            <View style={{ alignSelf: 'stretch', gap: space.sm, backgroundColor: colors.alertSoft, borderRadius: radius.md, padding: space.md }}>
              <T v="bodyStrong">Vider le coffre ?</T>
              <T v="small">
                Le coffre et tes objectifs reviennent à 0 €. Les {money(totals.declaredMinor + totals.observedMinor, cur)} redeviennent disponibles dans ta prévision. L’historique est conservé.
              </T>
              <Row>
                <Button small kind="secondary" label="Annuler" onPress={() => setConfirmEmpty(false)} style={{ flex: 1 }} />
                <Button
                  small
                  kind="danger"
                  label="Vider"
                  icon="trash"
                  onPress={() => {
                    setMsg(act((d, env) => emptyVault(d, env)));
                    setConfirmEmpty(false);
                  }}
                  style={{ flex: 1 }}
                />
              </Row>
            </View>
          ) : (
            <Button small kind="ghost" label="Vider le coffre" icon="trash" onPress={() => setConfirmEmpty(true)} />
          )
        ) : null}
      </Card>

      {msg ? <View style={{ marginTop: space.md }}><Notice tone="alert" text={msg} /></View> : null}

      {suggestions.length > 0 ? (
        <>
          <SectionTitle title="Virements vers ton épargne détectés" />
          <Card style={{ gap: space.sm }}>
            <T v="small" color={colors.textMuted}>
              Ces virements vont vers un de tes comptes d’épargne. Confirme ceux que tu veux compter dans ton coffre : rien n’est ajouté sans ton accord.
            </T>
            {suggestions.map((t) => (
              <Row key={t.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>
                    {t.label}
                  </T>
                  <T v="small" color={colors.textMuted}>
                    {shortDate(t.date)} · {money(-t.amountMinor, t.currency)}
                  </T>
                </View>
                <Button small kind="secondary" label="Ajouter" onPress={() => setMsg(act((d, env) => confirmSavingsTransfer(d, t, goals[0]?.goal.id ?? null, env)))} />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Objectifs" action="Nouveau" onAction={() => router.push('/goals/new')} />
      {goals.length === 0 ? (
        <EmptyState title="Ton coffre attend un objectif" text="Un voyage, un fonds de sécurité, un nouvel ordinateur… fixe un montant et avance à ton rythme." action="Créer un objectif" onAction={() => router.push('/goals/new')} />
      ) : (
        <View style={{ gap: space.sm }}>
          {goals.map((g) => {
            const meta = GOAL_ICONS[g.goal.icon];
            return (
              <Card key={g.goal.id} onPress={() => router.push(`/goals/${g.goal.id}`)} style={{ gap: 8 }}>
                <Row>
                  <IconBubble name={meta.icon} color={colors.habit} bg={colors.habitSoft} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{g.goal.name}</T>
                    <T v="small" color={colors.textMuted}>
                      {money(g.savedMinor, g.goal.currency)} sur {money(g.goal.targetMinor, g.goal.currency)}
                      {g.goal.deadline ? ` · avant le ${shortDate(g.goal.deadline)}` : ''}
                    </T>
                  </View>
                  {g.reached ? <Pill label="ATTEINT" color={colors.success} bg={colors.successSoft} icon="check" /> : <T v="bodyStrong" color={colors.habit}>{Math.round(g.ratio * 100)} %</T>}
                </Row>
                <ProgressBar value={g.ratio} color={g.reached ? colors.success : colors.habit} track={colors.habitSoft} label={g.goal.name} />
              </Card>
            );
          })}
        </View>
      )}

      <SectionTitle title="Dépenses évitées" action="Déclarer" onAction={() => router.push('/avoided/new')} />
      <Card style={{ gap: space.sm }}>
        <T v="small" color={colors.textMuted}>
          Économies estimées : {money(estimated, cur)}. C’est une estimation, pas de l’argent mis de côté : à toi de décider de le placer dans le coffre.
        </T>
        {data.avoided.length === 0 ? (
          <T color={colors.textMuted}>Une commande annulée, un repas fait maison ? Déclare-le ici.</T>
        ) : (
          [...data.avoided]
            .reverse()
            .slice(0, 5)
            .map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>
                    {a.label}
                  </T>
                  <T v="small" color={colors.textMuted}>
                    Prévu {money(a.plannedMinor, a.currency)} · dépensé {money(a.actualMinor, a.currency)} · estimé {money(estimatedSaving(a), a.currency)}
                  </T>
                </View>
                {a.setAsideEntryId ? (
                  <Pill label="MIS DE CÔTÉ" color={colors.success} bg={colors.successSoft} />
                ) : (
                  <Button small kind="secondary" label="Mettre de côté" onPress={() => router.push({ pathname: '/savings/new', params: { avoidedId: a.id } })} />
                )}
              </Row>
            ))
        )}
      </Card>

      <SectionTitle title="Historique" />
      <Card style={{ gap: 10 }}>
        {data.entries.length === 0 ? (
          <T color={colors.textMuted}>Aucune somme enregistrée pour l’instant.</T>
        ) : (
          [...data.entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10)
            .map((e) => (
              <Row key={e.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="small">{e.note ?? (e.kind === 'declared' ? 'Mise de côté déclarée' : 'Virement confirmé')}</T>
                  <T v="small" color={colors.textMuted}>
                    {shortDate(e.date)} · {e.kind === 'declared' ? 'déclaré' : 'virement observé'}
                    {e.allocations.length === 0 ? ' · non réparti' : ''}
                  </T>
                </View>
                <T v="bodyStrong" color={e.amountMinor > 0 ? colors.success : colors.text}>
                  {money(e.amountMinor, e.currency, true)}
                </T>
              </Row>
            ))
        )}
      </Card>
    </Screen>
  );
}
