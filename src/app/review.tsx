import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { isoWeekKey } from '@shared/domain/dates.ts';
import { completeWeeklyReview } from '@/store/actions';
import { useSpending } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Bars } from '@/ui/charts';
import { Button, Card, Chip, Row, T } from '@/ui/primitives';
import { categoryMeta } from '@/ui/categories';
import { money } from '@/ui/format';
import { dailySpending } from '@shared/domain/aggregation.ts';
import { useTransactions } from '@/store/hooks';
import { colors, space } from '@/theme/tokens';

/** Bilan hebdomadaire guidé : regarder, comprendre, décider. Une récompense par semaine. */
export default function WeeklyReview() {
  const { data, act, today } = useStore();
  const s = useSpending('week');
  const txs = useTransactions();
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState<'serein' | 'ok' | 'tendu' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = data.profile.currency;
  const already = data.weeklyReviews.some((w) => isoWeekKey(w.date) === isoWeekKey(today));
  const series = dailySpending(txs, s.period, cur);
  const top = s.current.byCategory[0];
  const over = s.budgets.filter((b) => b.health === 'over');

  return (
    <Screen back title="Bilan de la semaine" subtitle={already ? 'Déjà fait cette semaine. Tu peux le relire.' : `Étape ${step + 1} sur 3`}>
      {step === 0 ? (
        <View style={{ gap: space.md }}>
          <Card style={{ gap: space.sm }}>
            <T v="small" color={colors.textMuted}>
              Cette semaine, tu as dépensé
            </T>
            <T v="hero">{money(s.current.totalSpentMinor, cur)}</T>
            <Bars values={series.map((d) => d.spentMinor)} labels={['L', 'M', 'M', 'J', 'V', 'S', 'D']} color={colors.primary} />
            <T v="small" color={colors.textMuted}>
              Semaine précédente à la même date : {money(s.previousToDate.totalSpentMinor, cur)}
            </T>
          </Card>
          <Button label="Continuer" icon="right" onPress={() => setStep(1)} />
        </View>
      ) : null}
      {step === 1 ? (
        <View style={{ gap: space.md }}>
          <Card style={{ gap: space.sm }}>
            <T v="heading">Ce qui ressort</T>
            {top ? (
              <T>
                Ta première catégorie : <T v="bodyStrong">{categoryMeta(top.category).label}</T> ({money(top.spentMinor, cur)}).
              </T>
            ) : (
              <T color={colors.textMuted}>Aucune dépense enregistrée cette semaine.</T>
            )}
            {over.length ? (
              <T>
                Budget dépassé : {over.map((b) => categoryMeta(b.budget.category).label).join(', ')}. Pas de panique, la semaine prochaine est une nouvelle partie.
              </T>
            ) : s.budgets.length ? (
              <T color={colors.success}>Tous tes budgets hebdomadaires sont respectés.</T>
            ) : null}
            {s.current.pendingMinor > 0 ? <T v="small" color={colors.textMuted}>{money(s.current.pendingMinor, cur)} d’opérations encore en attente.</T> : null}
          </Card>
          <Button label="Continuer" icon="right" onPress={() => setStep(2)} />
        </View>
      ) : null}
      {step === 2 ? (
        <View style={{ gap: space.md }}>
          <Card style={{ gap: space.sm }}>
            <T v="heading">Et toi, comment tu te sens avec ton budget ?</T>
            <Row gap={8}>
              <Chip label="Serein" selected={mood === 'serein'} onPress={() => setMood('serein')} color={colors.success} />
              <Chip label="Ça va" selected={mood === 'ok'} onPress={() => setMood('ok')} color={colors.habit} />
              <Chip label="Tendu" selected={mood === 'tendu'} onPress={() => setMood('tendu')} color={colors.quest} />
            </Row>
            <T v="small" color={colors.textMuted}>
              Cette réponse reste privée, elle t’aide juste à suivre ton ressenti.
            </T>
          </Card>
          {error ? <Notice tone="info" text={error} /> : null}
          <Button
            kind="reward"
            icon="trophy"
            label={already ? 'Terminer' : 'Valider mon bilan · +20 XP'}
            onPress={() => {
              if (already) return router.back();
              const err = act((d, env) => completeWeeklyReview(d, mood, env));
              if (err) return setError(err);
              router.back();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
