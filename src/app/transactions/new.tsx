import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { CategoryId } from '@shared/domain/transactions.ts';
import { addManualTransaction } from '@/store/actions';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Button, Chip, Field, Row } from '@/ui/primitives';
import { AmountField, CategoryPicker, DatePicker, useAmount } from '@/ui/forms';
import { space } from '@/theme/tokens';

export default function NewTransaction() {
  const { act, today } = useStore();
  const amount = useAmount();
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!amount.minor) return setError('Indique un montant valide.');
    if (!category) return setError('Choisis une catégorie.');
    const err = act((d, env) => addManualTransaction(d, { label, amountMinor: amount.minor!, direction, date, category }, env));
    if (err) return setError(err);
    router.back();
  }

  return (
    <Screen back title="Saisir une opération" subtitle="Pour suivre ton budget sans connexion bancaire.">
      <View style={{ gap: space.md }}>
        <Row gap={8}>
          <Chip label="Dépense" selected={direction === 'debit'} onPress={() => setDirection('debit')} />
          <Chip label="Rentrée d’argent" selected={direction === 'credit'} onPress={() => setDirection('credit')} />
        </Row>
        <AmountField label="Montant" amount={amount} />
        <Field label="Libellé" value={label} onChangeText={setLabel} placeholder={direction === 'debit' ? 'ex. Courses au marché' : 'ex. Remboursement de Léa'} maxLength={120} />
        <CategoryPicker value={category} onChange={setCategory} />
        <DatePicker value={date} onChange={setDate} />
        {direction === 'credit' && category && category !== 'income' && category !== 'savings_transfers' ? (
          <Notice tone="info" text="Une rentrée classée dans une catégorie de dépense compte comme un remboursement : elle réduit cette catégorie, ce n’est pas un revenu." />
        ) : null}
        {error ? <Notice tone="alert" text={error} /> : null}
        <Button label="Enregistrer" icon="check" onPress={save} />
      </View>
    </Screen>
  );
}
