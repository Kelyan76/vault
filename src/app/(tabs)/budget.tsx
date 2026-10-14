import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { compare } from '@shared/domain/aggregation.ts';
import { useDataQuality, useSpending, useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useBank } from '@/features/bank/useBank';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { Screen, EmptyState } from '@/ui/layout';
import { Icon, IconBubble } from '@/ui/Icon';
import { Button, Card, Chip, Divider, IconButton, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { Donut } from '@/ui/charts';
import { categoryMeta } from '@/ui/categories';
import { money, relativeTime, shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function Budget() {
  const { data } = useStore();
  const [kind, setKind] = useState<'week' | 'month'>('month');
  const [offset, setOffset] = useState(0);
  const s = useSpending(kind, offset);
  const txs = useTransactions();
  const quality = useDataQuality();
  const bank = useBank();
  const cur = data.profile.currency;
  const cmp = compare(s.current.totalSpentMinor, offset === 0 ? s.previousToDate.totalSpentMinor : s.previous.totalSpentMinor);
  const recent = txs.filter((t) => t.date >= s.period.from && t.date <= s.period.to).slice(0, 6);
  const budgetCats = new Set(s.budgets.map((b) => b.budget.category));
  const lastSync = bank.connections.filter((c) => !c.disconnectedAt).map((c) => c.lastSyncAt).sort()[0] ?? null;

  return (
    <Screen title="Budget" subtitle="Tes dépenses, par catégorie et par période.">
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Chip label="Semaine" selected={kind === 'week'} onPress={() => { setKind('week'); setOffset(0); }} />
          <Chip label="Mois" selected={kind === 'month'} onPress={() => { setKind('month'); setOffset(0); }} />
        </Row>
        <Row gap={8}>
          <IconButton icon="left" label="Période précédente" onPress={() => setOffset(Math.min(offset + 1, 12))} />
          <IconButton icon="right" label="Période suivante" onPress={() => setOffset(Math.max(0, offset - 1))} />
        </Row>
      </Row>
      <T v="small" color={colors.textMuted} style={{ marginTop: space.sm }}>
        Du {shortDate(s.period.from)} au {shortDate(s.period.to)}
        {quality.mode === 'bank' || quality.mode === 'demo' ? ` · synchronisé ${relativeTime(lastSync)}` : quality.mode === 'manual' ? ' · saisies manuelles' : ''}
      </T>

      <Card style={{ marginTop: space.md, alignItems: 'center', gap: space.sm }}>
        <Donut
          parts={s.current.byCategory.map((c) => ({ key: c.category, value: c.spentMinor, color: categoryMeta(c.category).color }))}
          centerValue={money(s.current.totalSpentMinor, cur)}
          centerLabel="dépensés"
        />
        {cmp.changePct !== null ? (
          <Row gap={6}>
            <Icon name={cmp.changePct > 0 ? 'arrowUp' : 'arrowDown'} size={15} color={cmp.changePct > 0 ? colors.quest : colors.success} />
            <T v="small" color={colors.textMuted}>
              {Math.abs(cmp.changePct)} % par rapport à {offset === 0 ? 'la même durée de la période précédente' : 'la période précédente'}
            </T>
          </Row>
        ) : null}
        <Row gap={space.lg} style={{ marginTop: 4 }}>
          <View style={{ alignItems: 'center' }}>
            <T v="small" color={colors.textMuted}>
              Revenus
            </T>
            <T v="bodyStrong" color={colors.success}>
              {money(s.current.totalIncomeMinor, cur)}
            </T>
          </View>
          <View style={{ alignItems: 'center' }}>
            <T v="small" color={colors.textMuted}>
              Vers l’épargne
            </T>
            <T v="bodyStrong" color={colors.habit}>
              {money(s.current.savingsTransferMinor, cur)}
            </T>
          </View>
          <View style={{ alignItems: 'center' }}>
            <T v="small" color={colors.textMuted}>
              En attente
            </T>
            <T v="bodyStrong">{money(s.current.pendingMinor, cur)}</T>
          </View>
        </Row>
        {s.current.otherCurrencies.length ? (
          <T v="small" color={colors.textMuted} center>
            Opérations en {s.current.otherCurrencies.join(', ')} non incluses dans ce total (pas de conversion automatique).
          </T>
        ) : null}
      </Card>

      <SectionTitle title="Budgets" action="Ajouter" onAction={() => router.push({ pathname: '/budget/edit', params: { period: kind } })} />
      {s.budgets.length === 0 ? (
        <Card>
          <T color={colors.textMuted}>Aucun budget {kind === 'week' ? 'hebdomadaire' : 'mensuel'}. Fixe un plafond par catégorie pour suivre ce qu’il te reste.</T>
        </Card>
      ) : (
        <Card style={{ gap: space.md }}>
          {s.budgets.map((b) => {
            const meta = categoryMeta(b.budget.category);
            const color = b.health === 'over' ? colors.alert : b.health === 'warning' ? colors.reward : colors.success;
            return (
              <View key={b.budget.id} style={{ gap: 6 }}>
                <Row>
                  <IconBubble name={meta.icon} color={meta.color} bg={meta.bg} size={34} />
                  <T v="bodyStrong" style={{ flex: 1 }}>
                    {meta.label}
                  </T>
                  <T v="small" color={colors.textMuted}>
                    {money(b.spentMinor, cur)} / {money(b.budget.limitMinor, cur)}
                  </T>
                </Row>
                <ProgressBar value={b.ratio} color={color} track={colors.surfaceAlt} label={`Budget ${meta.label}`} />
                <T v="small" color={b.health === 'over' ? colors.alert : colors.textMuted}>
                  {b.remainingMinor >= 0 ? `Reste ${money(b.remainingMinor, cur)}` : `Dépassé de ${money(-b.remainingMinor, cur)}`}
                </T>
              </View>
            );
          })}
        </Card>
      )}

      <SectionTitle title="Par catégorie" action="Statistiques" onAction={() => router.push('/stats')} />
      {s.current.byCategory.length === 0 ? (
        <EmptyState title="Rien sur cette période" text="Connecte ta banque ou ajoute une dépense à la main pour voir la répartition." action="Ajouter une dépense" onAction={() => router.push('/transactions/new')} />
      ) : (
        <Card style={{ gap: 4 }}>
          {s.current.byCategory.map((c, i) => {
            const meta = categoryMeta(c.category);
            return (
              <View key={c.category}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ paddingVertical: 4 }}>
                  <IconBubble name={meta.icon} color={meta.color} bg={meta.bg} size={34} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{meta.label}</T>
                    <T v="small" color={colors.textMuted}>
                      {c.count} opération{c.count > 1 ? 's' : ''}
                      {!budgetCats.has(c.category) && c.category !== 'other' ? ' · pas de budget' : ''}
                    </T>
                  </View>
                  <T v="bodyStrong">{money(c.spentMinor, cur)}</T>
                </Row>
              </View>
            );
          })}
        </Card>
      )}

      <SectionTitle title="Opérations récentes" action="Tout voir" onAction={() => router.push('/transactions')} />
      <Card style={{ paddingVertical: space.xs }}>
        {recent.length === 0 ? (
          <T color={colors.textMuted} style={{ paddingVertical: space.sm }}>
            Aucune opération sur cette période.
          </T>
        ) : (
          recent.map((t) => <TransactionRow key={t.id} tx={t} />)
        )}
      </Card>
      <Row style={{ marginTop: space.md }}>
        <Button kind="secondary" label="Saisir une dépense" icon="plus" onPress={() => router.push('/transactions/new')} style={{ flex: 1 }} />
        <Button kind="secondary" label="Dépense évitée" icon="leaf" onPress={() => router.push('/avoided/new')} style={{ flex: 1 }} />
      </Row>
      {quality.mode === 'demo' ? (
        <View style={{ marginTop: space.md, alignItems: 'center' }}>
          <Pill label="CHIFFRES FICTIFS DE DÉMONSTRATION" color={colors.demo} bg={colors.demoSoft} icon="info" />
        </View>
      ) : null}
    </Screen>
  );
}
