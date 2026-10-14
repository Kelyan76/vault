import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { CategoryId } from '@shared/domain/transactions.ts';
import { removeBudget, upsertBudget } from '@/store/actions';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Button, Card, Chip, Row, T } from '@/ui/primitives';
import { AmountField, CategoryPicker, useAmount } from '@/ui/forms';
import { categoryMeta } from '@/ui/categories';
import { money } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function EditBudget() {
  const params = useLocalSearchParams<{ period?: string }>();
  const { act, data } = useStore();
  const [period, setPeriod] = useState<'week' | 'month'>(params.period === 'week' ? 'week' : 'month');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const amount = useAmount();
  const [error, setError] = useState<string | null>(null);
  const existing = data.budgets.filter((b) => b.period === period);

  function save() {
    if (!category) return setError('Choisis une catégorie.');
    if (!amount.minor) return setError('Indique un plafond valide.');
    const err = act((d, env) => upsertBudget(d, { category, limitMinor: amount.minor!, period }, env));
    if (err) return setError(err);
    router.back();
  }

  return (
    <Screen back title="Budget par catégorie" subtitle="Un plafond réaliste vaut mieux qu’un plafond parfait.">
      <View style={{ gap: space.md }}>
        <Row gap={8}>
          <Chip label="Par semaine" selected={period === 'week'} onPress={() => setPeriod('week')} />
          <Chip label="Par mois" selected={period === 'month'} onPress={() => setPeriod('month')} />
        </Row>
        <CategoryPicker value={category} onChange={setCategory} exclude={['income', 'savings_transfers']} />
        <AmountField label="Plafond" amount={amount} />
        {error ? <Notice tone="alert" text={error} /> : null}
        <Button label="Enregistrer le budget" icon="check" onPress={save} />
        {existing.length ? (
          <Card style={{ gap: 8 }}>
            <T v="bodyStrong">Budgets {period === 'week' ? 'hebdomadaires' : 'mensuels'}</T>
            {existing.map((b) => (
              <Row key={b.id} style={{ justifyContent: 'space-between' }}>
                <T style={{ flex: 1 }}>
                  {categoryMeta(b.category).label} · {money(b.limitMinor, b.currency)}
                </T>
                <Button small kind="danger" label="Retirer" onPress={() => act((d, env) => removeBudget(d, b.id, env))} />
              </Row>
            ))}
          </Card>
        ) : null}
        <T v="small" color={colors.textMuted}>
          Un seul budget par catégorie : en définir un nouveau remplace l’ancien.
        </T>
      </View>
    </Screen>
  );
}
