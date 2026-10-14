import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { parseAmountInput } from '@shared/domain/money.ts';
import { addAvoidedExpense } from '@/store/actions';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Button, Card, Field, T } from '@/ui/primitives';
import { AmountField, DatePicker, useAmount } from '@/ui/forms';
import { money } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function NewAvoided() {
  const { act, today, data } = useStore();
  const planned = useAmount();
  const actual = useAmount('0');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const actualMinor = actual.text.trim() === '0' || actual.text.trim() === '' ? 0 : parseAmountInput(actual.text, data.profile.currency);
  const estimate = planned.minor && actualMinor !== null ? Math.max(0, planned.minor - actualMinor) : null;

  function save() {
    if (!planned.minor) return setError('Indique le montant prévu.');
    if (actualMinor === null) return setError('Montant dépensé invalide.');
    const err = act((d, env) => addAvoidedExpense(d, { label, plannedMinor: planned.minor!, actualMinor, date }, env));
    if (err) return setError(err);
    router.back();
  }

  return (
    <Screen back title="Dépense évitée" subtitle="Tu as renoncé à un achat ou trouvé moins cher ? Note-le.">
      <View style={{ gap: space.md }}>
        <Field label="Qu’as-tu évité ?" value={label} onChangeText={setLabel} placeholder="ex. Commande de pizza" maxLength={80} />
        <AmountField label="Ce que ça aurait coûté" amount={planned} />
        <AmountField label="Ce que tu as dépensé à la place" amount={actual} hint="0 si rien. ex. repas maison : 7 €" />
        <DatePicker value={date} onChange={setDate} />
        {estimate !== null ? (
          <Card tone={colors.rewardSoft} style={{ gap: 4 }}>
            <T v="small" color={colors.rewardInk}>
              ÉCONOMIE ESTIMÉE
            </T>
            <T v="number">{money(estimate, data.profile.currency)}</T>
            <T v="small" color={colors.textMuted}>
              C’est une estimation : elle n’entre pas dans ton coffre. Tu pourras ensuite déclarer, séparément, la somme que tu mets vraiment de côté.
            </T>
          </Card>
        ) : null}
        {error ? <Notice tone="alert" text={error} /> : null}
        <Button label="Enregistrer" icon="check" onPress={save} />
      </View>
    </Screen>
  );
}
