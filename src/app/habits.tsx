import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays } from '@shared/domain/dates.ts';
import { encouragement } from '@shared/domain/habits.ts';
import { addHabit, archiveHabit, endPause, pauseHabits, toggleHabit } from '@/store/actions';
import { useStreaks } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Icon, IconBubble } from '@/ui/Icon';
import { Button, Card, Chip, Field, Row, SectionTitle, T } from '@/ui/primitives';
import { shortDate, weekday } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function Habits() {
  const { data, act, today } = useStore();
  const streaks = useStreaks();
  const [name, setName] = useState('');
  const [freq, setFreq] = useState<'daily' | 'weekly'>('daily');
  const [msg, setMsg] = useState<string | null>(null);
  const days = [-6, -5, -4, -3, -2, -1, 0].map((n) => addDays(today, n));
  const pause = data.habitPauses.find((p) => p.from <= today && p.to >= today);

  return (
    <Screen back title="Habitudes" subtitle="Les séries récompensent la régularité. Un jour manqué ne remet pas en cause tes progrès.">
      {pause ? (
        <Card tone={colors.habitSoft} style={{ gap: 8 }}>
          <T v="bodyStrong">En pause jusqu’au {shortDate(pause.to)}</T>
          <T v="small" color={colors.textMuted}>
            Tes séries sont gelées : elles reprendront là où tu les as laissées.
          </T>
          <Button small kind="secondary" label="Reprendre maintenant" onPress={() => act((d, env) => endPause(d, env))} />
        </Card>
      ) : (
        <Card tone={colors.habitSoft} style={{ gap: 8 }}>
          <T v="bodyStrong">Besoin de souffler ?</T>
          <T v="small" color={colors.textMuted}>
            Vacances, examens, coup dur : mets tes habitudes en pause sans perdre tes séries.
          </T>
          <Row gap={8}>
            {[3, 7, 14].map((n) => (
              <Chip key={n} label={`${n} jours`} selected={false} color={colors.habit} onPress={() => setMsg(act((d, env) => pauseHabits(d, n, env)))} />
            ))}
          </Row>
        </Card>
      )}

      {msg ? <View style={{ marginTop: space.sm }}><Notice tone="alert" text={msg} /></View> : null}

      <SectionTitle title="Mes habitudes" />
      <View style={{ gap: space.sm }}>
        {data.habits
          .filter((h) => !h.archivedAt)
          .map((h) => {
            const s = streaks.get(h.id)!;
            return (
              <Card key={h.id} style={{ gap: 10 }}>
                <Row>
                  <IconBubble name={h.icon} color={colors.habit} bg={colors.habitSoft} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{h.name}</T>
                    <T v="small" color={colors.textMuted}>
                      {encouragement(s)}
                    </T>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Row gap={2}>
                      <Icon name="flame" size={16} color={s.current ? colors.quest : colors.textMuted} />
                      <T v="bodyStrong">{s.current}</T>
                    </Row>
                    <T v="tiny" color={colors.textMuted}>
                      RECORD {s.best}
                    </T>
                  </View>
                </Row>
                {h.frequency === 'daily' ? (
                  <Row style={{ justifyContent: 'space-between' }}>
                    {days.map((d) => {
                      const done = data.habitCompletions.some((c) => c.habitId === h.id && c.date === d);
                      const editable = d >= addDays(today, -2);
                      return (
                        <Pressable
                          key={d}
                          disabled={!editable}
                          onPress={() => setMsg(act((x, env) => toggleHabit(x, h.id, d, env)))}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: done, disabled: !editable }}
                          accessibilityLabel={`${h.name}, ${shortDate(d)}`}
                          style={{ alignItems: 'center', gap: 4 }}
                        >
                          <T v="tiny" color={colors.textMuted}>
                            {weekday(d).toUpperCase().slice(0, 3)}
                          </T>
                          <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: done ? colors.habit : editable ? colors.surfaceAlt : colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: d === today ? 2 : 0, borderColor: colors.habit }}>
                            {done ? <Icon name="check" size={16} color={colors.onColor} strokeWidth={3} /> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </Row>
                ) : (
                  <Button
                    small
                    kind={s.doneInCurrentSlot ? 'secondary' : 'primary'}
                    icon={s.doneInCurrentSlot ? 'check' : undefined}
                    label={s.doneInCurrentSlot ? 'Fait cette semaine' : 'Marquer comme fait cette semaine'}
                    onPress={() => setMsg(act((x, env) => toggleHabit(x, h.id, today, env)))}
                  />
                )}
                <Pressable onPress={() => act((x, env) => archiveHabit(x, h.id, env))} accessibilityRole="button" hitSlop={8}>
                  <T v="small" color={colors.textMuted}>
                    Retirer cette habitude
                  </T>
                </Pressable>
              </Card>
            );
          })}
      </View>

      <SectionTitle title="Nouvelle habitude" />
      <Card style={{ gap: space.sm }}>
        <Field label="Nom" value={name} onChangeText={setName} placeholder="ex. Comparer avant d’acheter" maxLength={60} />
        <Row gap={8}>
          <Chip label="Chaque jour" selected={freq === 'daily'} onPress={() => setFreq('daily')} color={colors.habit} />
          <Chip label="Chaque semaine" selected={freq === 'weekly'} onPress={() => setFreq('weekly')} color={colors.habit} />
        </Row>
        <Button label="Ajouter" icon="plus" onPress={() => { const e = act((d, env) => addHabit(d, { name, frequency: freq, icon: 'target' }, env)); setMsg(e); if (!e) setName(''); }} />
      </Card>
    </Screen>
  );
}
