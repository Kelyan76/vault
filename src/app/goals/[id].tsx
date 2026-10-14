import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { parseAmountInput } from '@shared/domain/money.ts';
import { archiveGoal, correctSavingsEntry } from '@/store/actions';
import { useGoals } from '@/store/hooks';
import { useStore } from '@/store/store';
import { GOAL_ICONS } from '@/features/vault/goalIcons';
import { Screen, ErrorState, Notice } from '@/ui/layout';
import { IconBubble } from '@/ui/Icon';
import { Ring } from '@/ui/charts';
import { Button, Card, Field, IconButton, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { money, shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';
import { diffDays } from '@shared/domain/dates.ts';

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act, today } = useStore();
  const goals = useGoals();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const g = goals.find((x) => x.goal.id === id);
  if (!g) return <Screen back title="Objectif"><ErrorState text="Objectif introuvable." /></Screen>;
  const cur = g.goal.currency;
  const entries = data.entries.filter((e) => e.allocations.some((a) => a.goalId === g.goal.id)).sort((a, b) => b.date.localeCompare(a.date));
  const left = Math.max(0, g.goal.targetMinor - g.savedMinor);
  const daysLeft = g.goal.deadline ? diffDays(g.goal.deadline, today) : null;
  const perWeek = daysLeft && daysLeft > 0 && left > 0 ? Math.ceil(left / Math.max(1, daysLeft / 7)) : null;

  return (
    <Screen back>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ring value={g.ratio} size={140} thickness={14} color={g.reached ? colors.success : colors.habit} />
          <View style={{ position: 'absolute' }}>
            <IconBubble name={GOAL_ICONS[g.goal.icon].icon} color={colors.habit} bg={colors.habitSoft} size={54} />
          </View>
        </View>
        <T v="title" center>
          {g.goal.name}
        </T>
        <T v="number">{money(g.savedMinor, cur)}</T>
        <T color={colors.textMuted}>sur {money(g.goal.targetMinor, cur)}</T>
        {g.reached ? <Pill label="OBJECTIF ATTEINT" color={colors.success} bg={colors.successSoft} icon="check" /> : null}
        <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill label={`DÉCLARÉ ${money(g.declaredMinor, cur)}`} color={colors.primary} bg={colors.primarySoft} />
          <Pill label={`VIREMENTS ${money(g.observedMinor, cur)}`} color={colors.habit} bg={colors.habitSoft} />
        </Row>
      </Card>

      {!g.reached ? (
        <Card style={{ marginTop: space.md, gap: 4 }} tone={colors.habitSoft}>
          <T v="bodyStrong">Encore {money(left, cur)}</T>
          <T v="small" color={colors.textMuted}>
            {g.goal.deadline
              ? daysLeft !== null && daysLeft > 0
                ? `Échéance le ${shortDate(g.goal.deadline)} : environ ${money(perWeek ?? 0, cur)} par semaine. Ajuste librement, l’échéance n’est qu’un repère.`
                : 'L’échéance est passée : tu peux continuer sans pression.'
              : 'Pas d’échéance : avance à ton rythme.'}
          </T>
        </Card>
      ) : null}

      <Button label="Ajouter à cet objectif" icon="coin" style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/savings/new', params: { goalId: g.goal.id } })} />

      <SectionTitle title="Historique" />
      {msg ? <Notice tone="alert" text={msg} /> : null}
      <Card style={{ gap: 12 }}>
        {entries.length === 0 ? (
          <T color={colors.textMuted}>Aucune somme pour cet objectif.</T>
        ) : (
          entries.map((e) => {
            const part = e.allocations.find((a) => a.goalId === g.goal.id)!;
            return (
              <View key={e.id} style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T v="small">{e.note ?? (e.kind === 'declared' ? 'Mise de côté déclarée' : 'Virement confirmé')}</T>
                    <T v="small" color={colors.textMuted}>
                      {shortDate(e.date)} · {e.kind === 'declared' ? 'déclaré' : 'virement observé'}
                    </T>
                  </View>
                  <T v="bodyStrong">{money(part.amountMinor, cur, true)}</T>
                  {e.kind === 'declared' ? <IconButton icon="edit" label="Corriger" onPress={() => { setEditing(editing === e.id ? null : e.id); setValue(''); }} bg={colors.surfaceAlt} /> : null}
                </Row>
                {editing === e.id ? (
                  <Card tone={colors.surfaceAlt} style={{ gap: 8 }}>
                    <Field label={`Nouveau montant total de l’écriture (${cur})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder={money(e.amountMinor, cur)} />
                    <Row>
                      <Button small label="Corriger" style={{ flex: 1 }} onPress={() => {
                        const minor = parseAmountInput(value, cur);
                        if (!minor) return setMsg('Montant invalide.');
                        setMsg(act((d, env) => correctSavingsEntry(d, e.id, minor, env)));
                        setEditing(null);
                      }} />
                      <Button small kind="danger" label="Supprimer" style={{ flex: 1 }} onPress={() => { setMsg(act((d, env) => correctSavingsEntry(d, e.id, null, env))); setEditing(null); }} />
                    </Row>
                  </Card>
                ) : null}
              </View>
            );
          })
        )}
      </Card>
      <Button kind="ghost" label="Archiver l’objectif" style={{ marginTop: space.lg }} onPress={() => { act((d, env) => archiveGoal(d, g.goal.id, env)); router.back(); }} />
    </Screen>
  );
}
