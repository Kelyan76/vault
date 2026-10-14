import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ClassifiedTransaction } from '@shared/domain/aggregation.ts';
import { IconBubble } from '@/ui/Icon';
import { Pill, T } from '@/ui/primitives';
import { categoryMeta } from '@/ui/categories';
import { money, shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export function TransactionRow({ tx }: { tx: ClassifiedTransaction }) {
  const meta = categoryMeta(tx.classified.category);
  const transfer = tx.classified.kind === 'internal_transfer' || tx.classified.kind === 'savings_transfer';
  const positive = tx.amountMinor > 0;
  return (
    <Pressable
      onPress={() => router.push(`/transactions/${encodeURIComponent(tx.id)}`)}
      accessibilityRole="button"
      accessibilityLabel={`${tx.label}, ${money(tx.amountMinor, tx.currency, true)}, ${meta.label}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <IconBubble name={meta.icon} color={meta.color} bg={meta.bg} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {tx.label}
        </T>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <T v="small" color={colors.textMuted}>
            {shortDate(tx.date)} · {meta.label}
          </T>
          {tx.status === 'pending' ? <Pill label="EN ATTENTE" color={colors.rewardInk} bg={colors.rewardSoft} /> : null}
          {tx.source === 'manual' ? <Pill label="MANUEL" color={colors.textMuted} bg={colors.surfaceAlt} /> : null}
          {tx.source === 'demo' ? <Pill label="DÉMO" color={colors.demo} bg={colors.demoSoft} /> : null}
          {tx.classified.source === 'user' && tx.source !== 'manual' ? <Pill label="CORRIGÉ" color={colors.primary} bg={colors.primarySoft} /> : null}
        </View>
      </View>
      <T v="bodyStrong" color={transfer ? colors.textMuted : positive ? colors.success : colors.text}>
        {money(tx.amountMinor, tx.currency, true)}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10 },
});
