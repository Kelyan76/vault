import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CATEGORY_IDS, type CategoryId } from '@shared/domain/transactions.ts';
import { deleteManualTransaction, setCategory } from '@/store/actions';
import { useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useServerBank } from '@/features/bank/serverBank';
import { Screen, ErrorState, Notice } from '@/ui/layout';
import { IconBubble } from '@/ui/Icon';
import { Button, Card, Chip, Divider, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { categoryMeta, KIND_LABELS, SOURCE_LABELS } from '@/ui/categories';
import { money, relativeTime, shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const txs = useTransactions();
  const { act, data } = useStore();
  const server = useServerBank();
  const [msg, setMsg] = useState<{ tone: 'success' | 'alert'; text: string } | null>(null);
  const tx = txs.find((t) => t.id === decodeURIComponent(id ?? ''));
  if (!tx) return <Screen back title="Opération"><ErrorState text="Opération introuvable (elle a peut-être été supprimée)." /></Screen>;
  const meta = categoryMeta(tx.classified.category);
  const isServer = tx.source === 'bank';
  const override = isServer ? server.data?.overrides.find((o) => o.transactionId === tx.id) : data.overrides.find((o) => o.transactionId === tx.id);
  const account = data.bank.accounts.find((a) => a.id === tx.accountId) ?? server.data?.accountsFull.find((a) => a.id === tx.accountId);
  async function changeCategory(c: CategoryId | null) {
    const err = isServer ? await server.setCategory(tx!.id, c) : act((d, env) => setCategory(d, tx!.id, c, env));
    setMsg(err ? { tone: 'alert', text: err } : { tone: 'success', text: c ? `Classée dans « ${categoryMeta(c).label} ».` : 'Catégorie d’origine rétablie.' });
  }

  return (
    <Screen back>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <IconBubble name={meta.icon} color={meta.color} bg={meta.bg} size={64} />
        <T v="hero" color={tx.amountMinor > 0 ? colors.success : colors.text}>
          {money(tx.amountMinor, tx.currency, true)}
        </T>
        <T v="heading" center>
          {tx.label}
        </T>
        <Row gap={6}>
          {tx.status === 'pending' ? <Pill label="EN ATTENTE" color={colors.rewardInk} bg={colors.rewardSoft} /> : <Pill label="COMPTABILISÉE" color={colors.success} bg={colors.successSoft} />}
          {tx.source === 'demo' ? <Pill label="DÉMO" color={colors.demo} bg={colors.demoSoft} /> : null}
          {tx.source === 'manual' ? <Pill label="SAISIE MANUELLE" color={colors.textMuted} bg={colors.surfaceAlt} /> : null}
        </Row>
      </View>

      <Card style={{ marginTop: space.lg, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T color={colors.textMuted}>Date</T>
          <T v="bodyStrong">{shortDate(tx.date)}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T color={colors.textMuted}>Nature</T>
          <T v="bodyStrong">{KIND_LABELS[tx.classified.kind]}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T color={colors.textMuted}>Compte</T>
          <T v="bodyStrong">{account?.name ?? (tx.source === 'manual' ? 'Saisie manuelle' : '—')}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T color={colors.textMuted}>Catégorie</T>
          <T v="bodyStrong">{meta.label}</T>
        </Row>
        <T v="small" color={colors.textMuted}>
          Origine : {SOURCE_LABELS[tx.classified.source]}
        </T>
        {tx.syncedAt ? (
          <T v="small" color={colors.textMuted}>
            Synchronisée {relativeTime(tx.syncedAt)}
          </T>
        ) : null}
        {tx.status === 'pending' ? (
          <T v="small" color={colors.textMuted}>
            Une opération en attente peut encore changer de montant ou disparaître. Elle n’est pas comptée dans tes dépenses confirmées.
          </T>
        ) : null}
      </Card>

      <SectionTitle title="Corriger la catégorie" />
      <T v="small" color={colors.textMuted} style={{ marginBottom: space.sm }}>
        Le montant et la date ne changent pas. Ta correction est conservée lors des prochaines synchronisations.
      </T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {CATEGORY_IDS.map((c) => (
          <Chip
            key={c}
            label={categoryMeta(c).label}
            selected={tx.classified.category === c}
            color={categoryMeta(c).color}
            onPress={() => changeCategory(c)}
          />
        ))}
      </Row>
      {override && tx.source !== 'manual' ? (
        <Button kind="ghost" label="Revenir à la catégorie d’origine" onPress={() => changeCategory(null)} />
      ) : null}
      {msg ? <View style={{ marginTop: space.sm }}><Notice tone={msg.tone} text={msg.text} /></View> : null}

      {tx.source === 'manual' ? (
        <Button kind="danger" icon="trash" label="Supprimer cette saisie" style={{ marginTop: space.xl }} onPress={() => { act((d, env) => deleteManualTransaction(d, tx.id, env)); router.back(); }} />
      ) : null}
    </Screen>
  );
}
