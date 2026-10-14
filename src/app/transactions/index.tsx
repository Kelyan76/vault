import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { searchTransactions } from '@shared/domain/aggregation.ts';
import { addDays } from '@shared/domain/dates.ts';
import { CATEGORY_IDS, type CategoryId } from '@shared/domain/transactions.ts';
import { useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { Screen, EmptyState } from '@/ui/layout';
import { Card, Chip, Field, IconButton, Row, T } from '@/ui/primitives';
import { categoryMeta } from '@/ui/categories';
import { colors, space } from '@/theme/tokens';

const RANGES = [
  { key: '7', label: '7 jours', days: 7 },
  { key: '30', label: '30 jours', days: 30 },
  { key: '90', label: '3 mois', days: 90 },
  { key: 'all', label: 'Tout', days: 0 },
] as const;

export default function Transactions() {
  const { today } = useStore();
  const txs = useTransactions();
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30');
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [limit, setLimit] = useState(50);

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const from = days ? addDays(today, -(days - 1)) : '0000-01-01';
    return searchTransactions(txs, query).filter((t) => t.date >= from && (!cat || t.classified.category === cat));
  }, [txs, query, range, cat, today]);

  return (
    <Screen back title="Opérations" right={<IconButton icon="plus" label="Ajouter une opération" onPress={() => router.push('/transactions/new')} bg={colors.primary} color="#fff" />}>
      <Field label="Rechercher" value={query} onChangeText={setQuery} placeholder="Libellé, ex. Lidl" autoCorrect={false} />
      <Row gap={8} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
        {RANGES.map((r) => (
          <Chip key={r.key} label={r.label} selected={range === r.key} onPress={() => setRange(r.key)} />
        ))}
      </Row>
      <Row gap={8} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
        <Chip label="Toutes catégories" selected={!cat} onPress={() => setCat(null)} color={colors.text} />
        {CATEGORY_IDS.map((c) => (
          <Chip key={c} label={categoryMeta(c).label} selected={cat === c} onPress={() => setCat(cat === c ? null : c)} color={categoryMeta(c).color} />
        ))}
      </Row>
      <T v="small" color={colors.textMuted} style={{ marginVertical: space.sm }}>
        {filtered.length} opération{filtered.length > 1 ? 's' : ''}
      </T>
      {filtered.length === 0 ? (
        <EmptyState title="Aucune opération" text={txs.length ? 'Aucun résultat avec ces filtres.' : 'Connecte ta banque ou saisis ta première dépense.'} action="Saisir une dépense" onAction={() => router.push('/transactions/new')} />
      ) : (
        <Card style={{ paddingVertical: space.xs }}>
          {filtered.slice(0, limit).map((t) => (
            <TransactionRow key={t.id} tx={t} />
          ))}
          {filtered.length > limit ? (
            <View style={{ paddingVertical: space.sm }}>
              <Chip label={`Afficher plus (${filtered.length - limit} restantes)`} selected={false} onPress={() => setLimit(limit + 50)} />
            </View>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}
