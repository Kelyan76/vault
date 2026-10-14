import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { QUEST_CATALOG, questById, type QuestCategory } from '@shared/domain/quests.ts';
import { useQuestEvaluations } from '@/store/hooks';
import { useStore } from '@/store/store';
import { DIFFICULTY, QUEST_CATEGORY, STATE_LABEL } from '@/features/quests/meta';
import { Screen, EmptyState } from '@/ui/layout';
import { IconBubble } from '@/ui/Icon';
import { Card, Chip, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function Quests() {
  const { data } = useStore();
  const evals = useQuestEvaluations();
  const [filter, setFilter] = useState<QuestCategory | 'all'>('all');
  const active = data.userQuests.filter((q) => q.status === 'active');
  const activeIds = new Set(active.map((q) => q.questId));
  const available = QUEST_CATALOG.filter((q) => !activeIds.has(q.id) && (filter === 'all' || q.category === filter));
  const done = data.userQuests.filter((q) => q.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return (
    <Screen title="Quêtes" subtitle="Des missions concrètes. Ta régularité compte plus que les montants.">
      <SectionTitle title={`En cours (${active.length}/5)`} />
      {active.length === 0 ? (
        <EmptyState art="quest" title="Aucune quête en cours" text="Choisis une quête ci-dessous pour commencer. Tu peux en mener jusqu’à 5 à la fois." />
      ) : (
        <View style={{ gap: space.sm }}>
          {active.map((q) => {
            const def = questById(q.questId)!;
            const ev = evals.get(q.id)!;
            const st = STATE_LABEL[ev.state];
            const cat = QUEST_CATEGORY[def.category];
            return (
              <Card key={q.id} onPress={() => router.push(`/quest/${q.id}`)} style={{ gap: 10 }}>
                <Row>
                  <IconBubble name={cat.icon} color={colors.quest} bg={colors.questSoft} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{def.title}</T>
                    <T v="small" color={colors.textMuted}>
                      Jusqu’au {shortDate(q.endDate)} · +{def.xp} XP
                    </T>
                  </View>
                  <Pill label={st.label} color={st.color} bg={st.bg} />
                </Row>
                <ProgressBar value={ev.progress} color={ev.state === 'ready' ? colors.success : colors.quest} track={colors.questSoft} label={def.title} />
                <T v="small" color={colors.textMuted}>
                  {ev.detail}
                </T>
              </Card>
            );
          })}
        </View>
      )}

      <SectionTitle title="Nouvelles quêtes" />
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
        <Chip label="Toutes" selected={filter === 'all'} onPress={() => setFilter('all')} color={colors.quest} />
        {(Object.keys(QUEST_CATEGORY) as QuestCategory[]).map((c) => (
          <Chip key={c} label={QUEST_CATEGORY[c].label} selected={filter === c} onPress={() => setFilter(c)} color={colors.quest} />
        ))}
      </Row>
      <View style={{ gap: space.sm }}>
        {available.map((def) => {
          const cat = QUEST_CATEGORY[def.category];
          const diff = DIFFICULTY[def.difficulty];
          return (
            <Card key={def.id} onPress={() => router.push(`/quest/${def.id}`)} style={{ gap: 6 }}>
              <Row>
                <IconBubble name={cat.icon} color={colors.quest} bg={colors.questSoft} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{def.title}</T>
                  <T v="small" color={colors.textMuted}>
                    {cat.label} · {diff.label} · {def.durationDays} jours
                  </T>
                </View>
                <Pill label={`+${def.xp} XP`} color={colors.rewardInk} bg={colors.rewardSoft} />
              </Row>
              <T v="small" color={colors.textMuted}>
                {def.description}
              </T>
            </Card>
          );
        })}
        {available.length === 0 ? <T color={colors.textMuted}>Toutes les quêtes de cette catégorie sont en cours.</T> : null}
      </View>

      {done.length > 0 ? (
        <>
          <SectionTitle title="Terminées" />
          <Card style={{ gap: 8 }}>
            {done.map((q) => (
              <Row key={q.id} style={{ justifyContent: 'space-between' }}>
                <T v="small" style={{ flex: 1 }}>
                  {questById(q.questId)?.title}
                </T>
                <T v="small" color={colors.textMuted}>
                  {q.completedAt ? shortDate(q.completedAt) : ''}
                </T>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
