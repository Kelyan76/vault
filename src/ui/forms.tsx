import { useState } from 'react';
import { View } from 'react-native';
import { addDays } from '@shared/domain/dates.ts';
import { parseAmountInput } from '@shared/domain/money.ts';
import { CATEGORY_IDS, type CategoryId } from '@shared/domain/transactions.ts';
import { useStore } from '@/store/store';
import { categoryMeta } from './categories';
import { Chip, Field, Row, T } from './primitives';
import { colors } from '@/theme/tokens';

/** Saisie de montant validée (« 12,50 ») ; renvoie les unités mineures ou null. */
export function useAmount(initial = '') {
  const { data } = useStore();
  const [text, setText] = useState(initial);
  const minor = parseAmountInput(text, data.profile.currency);
  return { text, setText, minor, valid: minor !== null, currency: data.profile.currency };
}

export function AmountField({ label, amount, hint }: { label: string; amount: ReturnType<typeof useAmount>; hint?: string }) {
  return (
    <Field
      label={`${label} (${amount.currency})`}
      value={amount.text}
      onChangeText={amount.setText}
      keyboardType="decimal-pad"
      placeholder="0,00"
      hint={hint}
      error={amount.text && !amount.valid ? 'Montant invalide (ex. 12,50).' : null}
      maxLength={12}
    />
  );
}

export function DatePicker({ value, onChange, allowFuture = false }: { value: string; onChange: (d: string) => void; allowFuture?: boolean }) {
  const { today } = useStore();
  const [custom, setCustom] = useState('');
  const quick = [
    { label: 'Aujourd’hui', d: today },
    { label: 'Hier', d: addDays(today, -1) },
    { label: 'Avant-hier', d: addDays(today, -2) },
  ];
  const invalid = custom.length > 0 && (!/^\d{4}-\d{2}-\d{2}$/.test(custom) || Number.isNaN(Date.parse(custom)) || (!allowFuture && custom > today));
  return (
    <View style={{ gap: 8 }}>
      <T v="small" color={colors.textMuted}>
        Date
      </T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {quick.map((q) => (
          <Chip key={q.d} label={q.label} selected={value === q.d && !custom} onPress={() => { setCustom(''); onChange(q.d); }} />
        ))}
      </Row>
      <Field
        label="Autre date (AAAA-MM-JJ)"
        value={custom}
        onChangeText={(t) => {
          setCustom(t);
          if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) && (allowFuture || t <= today)) onChange(t);
        }}
        placeholder={today}
        error={invalid ? (custom > today && !allowFuture ? 'Pas de date future.' : 'Format attendu : 2026-10-14') : null}
        maxLength={10}
      />
    </View>
  );
}

export function CategoryPicker({ value, onChange, exclude = [] }: { value: CategoryId | null; onChange: (c: CategoryId) => void; exclude?: CategoryId[] }) {
  return (
    <View style={{ gap: 8 }}>
      <T v="small" color={colors.textMuted}>
        Catégorie
      </T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {CATEGORY_IDS.filter((c) => !exclude.includes(c)).map((c) => (
          <Chip key={c} label={categoryMeta(c).label} selected={value === c} onPress={() => onChange(c)} color={categoryMeta(c).color} />
        ))}
      </Row>
    </View>
  );
}
