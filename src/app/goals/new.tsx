import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { GoalIcon } from '@shared/domain/savings.ts';
import { createGoal } from '@/store/actions';
import { useStore } from '@/store/store';
import { GOAL_ICONS } from '@/features/vault/goalIcons';
import { Screen, Notice } from '@/ui/layout';
import { IconBubble } from '@/ui/Icon';
import { Button, Chip, Field, Row, T } from '@/ui/primitives';
import { AmountField, useAmount } from '@/ui/forms';
import { addDays } from '@shared/domain/dates.ts';
import { colors, space } from '@/theme/tokens';

export default function NewGoal() {
  const { act, today } = useStore();
  const amount = useAmount();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<GoalIcon>('plane');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!amount.minor) return setError('Indique un montant cible valide.');
    const err = act((d, env) => createGoal(d, { name, targetMinor: amount.minor!, icon, deadline }, env));
    if (err) return setError(err);
    router.back();
  }

  return (
    <Screen back title="Nouvel objectif" subtitle="Fixe un cap. Tu y avances à ton rythme, chaque euro compte.">
      <View style={{ gap: space.md }}>
        <Field label="Nom" value={name} onChangeText={setName} placeholder="ex. Week-end à Lisbonne" maxLength={60} />
        <AmountField label="Montant cible" amount={amount} />
        <T v="small" color={colors.textMuted}>
          Icône
        </T>
        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          {(Object.keys(GOAL_ICONS) as GoalIcon[]).map((k) => (
            <Pressable key={k} onPress={() => setIcon(k)} accessibilityRole="radio" accessibilityState={{ selected: icon === k }} accessibilityLabel={GOAL_ICONS[k].label}>
              <View style={{ borderRadius: 16, borderWidth: 2, borderColor: icon === k ? colors.habit : 'transparent', padding: 2 }}>
                <IconBubble name={GOAL_ICONS[k].icon} color={colors.habit} bg={colors.habitSoft} size={46} />
              </View>
            </Pressable>
          ))}
        </Row>
        <T v="small" color={colors.textMuted}>
          Échéance (facultative)
        </T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip label="Aucune" selected={!deadline} onPress={() => setDeadline(null)} color={colors.habit} />
          {[30, 90, 180, 365].map((n) => (
            <Chip key={n} label={n < 365 ? `${Math.round(n / 30)} mois` : '1 an'} selected={deadline === addDays(today, n)} onPress={() => setDeadline(addDays(today, n))} color={colors.habit} />
          ))}
        </Row>
        {error ? <Notice tone="alert" text={error} /> : null}
        <Button label="Créer l’objectif" icon="check" onPress={save} />
      </View>
    </Screen>
  );
}
