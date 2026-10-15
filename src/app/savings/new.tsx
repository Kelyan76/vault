import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { estimatedSaving, splitEvenly } from '@shared/domain/savings.ts';
import { addSavingsEntry, setAsideFromAvoided } from '@/store/actions';
import { useGoals } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Button, Chip, Field, Row, T } from '@/ui/primitives';
import { AmountField, DatePicker, useAmount } from '@/ui/forms';
import { money } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function NewSaving() {
  const params = useLocalSearchParams<{ goalId?: string; avoidedId?: string }>();
  const { act, today, data } = useStore();
  const goals = useGoals().filter((g) => !g.reached || g.goal.id === params.goalId);
  const avoided = data.avoided.find((a) => a.id === params.avoidedId);
  const amount = useAmount(avoided ? String(estimatedSaving(avoided) / 100).replace('.', ',') : '');
  const [selected, setSelected] = useState<string[]>(params.goalId ? [params.goalId] : goals[0] ? [goals[0].goal.id] : []);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const allocations = useMemo(() => (amount.minor ? splitEvenly(amount.minor, selected) : []), [amount.minor, selected]);

  function save() {
    if (!amount.minor) return setError('Indique un montant valide.');
    const err = avoided
      ? act((d, env) => setAsideFromAvoided(d, avoided.id, amount.minor!, selected[0] ?? null, env))
      : act((d, env) => addSavingsEntry(d, { amountMinor: amount.minor!, allocations, date, note }, env));
    if (err) return setError(err);
    router.back();
  }

  return (
    <Screen back title="Mettre de côté" subtitle="Déclare une somme que tu as réellement mise de côté. Le coffre en garde la trace ; l’argent reste sur ton compte.">
      <View style={{ gap: space.md }}>
        {avoided ? (
          <Notice tone="info" text={`Économie estimée sur « ${avoided.label} » : ${money(estimatedSaving(avoided), avoided.currency)}. Indique ce que tu as vraiment mis de côté (au plus ce montant).`} />
        ) : null}
        <AmountField label="Montant" amount={amount} />
        <T v="small" color={colors.textMuted}>
          Dans quel sous-coffre ? {selected.length > 1 ? '(réparti à parts égales)' : ''}
        </T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {goals.map((g) => (
            <Chip
              key={g.goal.id}
              label={g.goal.name}
              color={colors.habit}
              selected={selected.includes(g.goal.id)}
              onPress={() => setSelected(avoided ? [g.goal.id] : selected.includes(g.goal.id) ? selected.filter((x) => x !== g.goal.id) : [...selected, g.goal.id])}
            />
          ))}
          {goals.length === 0 ? <T v="small" color={colors.textMuted}>Aucun objectif : la somme sera suivie dans le coffre sans être répartie.</T> : null}
        </Row>
        {allocations.length > 1 ? (
          <T v="small" color={colors.textMuted}>
            {allocations.map((a) => `${goals.find((g) => g.goal.id === a.goalId)?.goal.name} : ${money(a.amountMinor, amount.currency)}`).join(' · ')}
          </T>
        ) : null}
        {!avoided ? (
          <>
            <DatePicker value={date} onChange={setDate} />
            <Field label="Note (facultative)" value={note} onChangeText={setNote} placeholder="ex. Vente d’un vieux vélo" maxLength={200} />
          </>
        ) : null}
        {error ? <Notice tone="alert" text={error} /> : null}
        <Button label="Ajouter au coffre" icon="coin" onPress={save} />
      </View>
    </Screen>
  );
}
