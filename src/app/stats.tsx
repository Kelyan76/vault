import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { dailySpending, summarizeSpending } from '@shared/domain/aggregation.ts';
import { addDays, periodContaining, previousPeriod } from '@shared/domain/dates.ts';
import { useDataQuality, useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Screen, EmptyState } from '@/ui/layout';
import { Bars } from '@/ui/charts';
import { Card, Chip, Divider, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { categoryMeta } from '@/ui/categories';
import { money, monthName } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function Stats() {
  const { data, today } = useStore();
  const txs = useTransactions();
  const quality = useDataQuality();
  const cur = data.profile.currency;
  const [view, setView] = useState<'weeks' | 'months'>('weeks');

  const series = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    let p = periodContaining(today, view === 'weeks' ? 'week' : 'month');
    for (let i = 0; i < 6; i++) {
      out.unshift({ label: view === 'weeks' ? p.from.slice(8, 10) + '/' + p.from.slice(5, 7) : monthName(p.from).slice(0, 4), total: summarizeSpending(txs, p, cur).totalSpentMinor });
      p = previousPeriod(p, view === 'weeks' ? 'week' : 'month');
    }
    return out;
  }, [txs, today, view, cur]);

  const last30 = useMemo(() => dailySpending(txs, { from: addDays(today, -29), to: today }, cur), [txs, today, cur]);
  const month = useMemo(() => summarizeSpending(txs, periodContaining(today, 'month'), cur), [txs, today, cur]);
  const prevMonth = useMemo(() => summarizeSpending(txs, previousPeriod(periodContaining(today, 'month'), 'month'), cur), [txs, today, cur]);
  const avg = series.slice(0, -1).reduce((s, x) => s + x.total, 0) / Math.max(1, series.length - 1);

  if (txs.length === 0) {
    return (
      <Screen back title="Statistiques">
        <EmptyState title="Pas encore de données" text="Les statistiques apparaîtront dès tes premières opérations." />
      </Screen>
    );
  }

  return (
    <Screen back title="Statistiques" subtitle={quality.mode === 'demo' ? 'Données fictives de démonstration.' : quality.mode === 'manual' ? 'Calculées à partir de tes saisies manuelles.' : 'Calculées à partir des opérations importées et de tes corrections.'}>
      <Row gap={8}>
        <Chip label="6 semaines" selected={view === 'weeks'} onPress={() => setView('weeks')} />
        <Chip label="6 mois" selected={view === 'months'} onPress={() => setView('months')} />
      </Row>
      <Card style={{ marginTop: space.md, gap: space.sm }}>
        <T v="small" color={colors.textMuted}>
          Dépenses par {view === 'weeks' ? 'semaine' : 'mois'} (la dernière barre est en cours)
        </T>
        <Bars values={series.map((s) => s.total)} labels={series.map((s) => s.label)} highlightLast reference={avg} height={140} />
        <T v="small" color={colors.textMuted}>
          Pointillés : moyenne des périodes terminées ({money(Math.round(avg), cur)}).
        </T>
      </Card>

      <SectionTitle title="30 derniers jours" />
      <Card>
        <Bars values={last30.map((d) => d.spentMinor)} height={90} color={colors.habit} />
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <T v="small" color={colors.textMuted}>
            Il y a 30 jours
          </T>
          <T v="small" color={colors.textMuted}>
            Aujourd’hui
          </T>
        </Row>
      </Card>

      <SectionTitle title={`${monthName(today)} vs mois précédent`} />
      <Card style={{ gap: 10 }}>
        {month.byCategory.map((c, i) => {
          const prev = prevMonth.byCategory.find((p) => p.category === c.category)?.spentMinor ?? 0;
          const max = Math.max(c.spentMinor, prev, 1);
          const meta = categoryMeta(c.category);
          return (
            <View key={c.category} style={{ gap: 4 }}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="bodyStrong">{meta.label}</T>
                <T v="small" color={colors.textMuted}>
                  {money(c.spentMinor, cur)} · avant {money(prev, cur)}
                </T>
              </Row>
              <ProgressBar value={c.spentMinor / max} color={meta.color} track={colors.surfaceAlt} height={8} label={meta.label} />
              <ProgressBar value={prev / max} color="#CFC8BC" track={colors.surfaceAlt} height={5} label={`${meta.label} mois précédent`} />
            </View>
          );
        })}
        <T v="small" color={colors.textMuted}>
          Les transferts entre tes comptes et les versements vers l’épargne ne sont pas comptés comme des dépenses ; les remboursements réduisent la catégorie concernée.
        </T>
      </Card>
    </Screen>
  );
}
