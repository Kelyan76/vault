import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { estimatedSaving, savingsTransferSuggestions, SUBVAULT_PRESETS, vaultStage, vaultTotals } from '@shared/domain/savings.ts';
import { confirmSavingsTransfer, createGoal, emptyVault } from '@/store/actions';
import { useGoals, useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { GOAL_ICONS } from '@/features/vault/goalIcons';
import { Chest } from '@/art/Chest';
import { Screen, EmptyState, Notice } from '@/ui/layout';
import { Icon, IconBubble } from '@/ui/Icon';
import { Button, Card, Chip, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { money, shortDate } from '@/ui/format';
import { colors, fonts, radius, space } from '@/theme/tokens';

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
  const taken = new Set(goals.map((g) => g.goal.name.toLowerCase()));
  const presets = SUBVAULT_PRESETS.filter((p) => !taken.has(p.name.toLowerCase()));

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
          <Button kind="secondary" label="Sous-coffre" icon="plus" onPress={() => router.push('/goals/new')} style={{ flex: 1 }} />
        </Row>
        <T v="small" color={colors.textMuted} center>
          Ce que tu mets de côté ici est retiré de ta prévision de fin de mois : tu vois ce qu’il te reste vraiment.
        </T>
        {totals.declaredMinor + totals.observedMinor > 0 ? (
          confirmEmpty ? (
            <View style={{ alignSelf: 'stretch', gap: space.sm, backgroundColor: colors.alertSoft, borderRadius: radius.md, padding: space.md }}>
              <T v="bodyStrong">Vider le coffre ?</T>
              <T v="small">
                Le coffre et tes sous-coffres reviennent à 0 €. Les {money(totals.declaredMinor + totals.observedMinor, cur)} redeviennent disponibles dans ta prévision. L’historique est conservé.
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

      <SectionTitle title="Sous-coffres" action="Personnaliser" onAction={() => router.push('/goals/new')} />
      {goals.length === 0 ? (
        <T v="small" color={colors.textMuted} style={{ marginBottom: space.sm }}>
          Range ton épargne par projet. Touche un modèle pour le créer, ou crée le tien.
        </T>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.sm, marginBottom: space.sm }}>
          {goals.map((g) => {
            const meta = GOAL_ICONS[g.goal.icon];
            const hasTarget = g.goal.targetMinor > 0;
            return (
              <Card key={g.goal.id} onPress={() => router.push(`/goals/${g.goal.id}`)} style={{ width: '48%', gap: 8 }} accessibilityLabel={g.goal.name}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <IconBubble name={meta.icon} color={colors.habit} bg={colors.habitSoft} size={36} />
                  {g.reached ? <Icon name="check" size={18} color={colors.success} /> : hasTarget ? <T v="small" color={colors.habit}>{Math.round(g.ratio * 100)} %</T> : null}
                </Row>
                <T v="bodyStrong" numberOfLines={1}>
                  {g.goal.name}
                </T>
                <T v="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 19 }}>{money(g.savedMinor, g.goal.currency)}</T>
                {hasTarget ? (
                  <>
                    <ProgressBar value={g.ratio} color={g.reached ? colors.success : colors.habit} track={colors.habitSoft} label={g.goal.name} />
                    <T v="tiny" color={colors.textMuted} numberOfLines={1}>
                      SUR {money(g.goal.targetMinor, g.goal.currency)}
                      {g.goal.deadline ? ` · ${shortDate(g.goal.deadline)}` : ''}
                    </T>
                  </>
                ) : (
                  <T v="tiny" color={colors.textMuted}>SANS MONTANT CIBLE</T>
                )}
              </Card>
            );
          })}
        </View>
      )}
      {presets.length > 0 ? (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <Chip key={p.name} selected={false} label={`+ ${p.name}`} color={colors.habit} onPress={() => setMsg(act((d, env) => createGoal(d, { name: p.name, targetMinor: 0, icon: p.icon }, env)))} />
          ))}
          <Chip selected={false} label="+ Autre…" color={colors.primary} onPress={() => router.push('/goals/new')} />
        </Row>
      ) : null}

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
