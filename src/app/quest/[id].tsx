import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { questById } from '@shared/domain/quests.ts';
import { abandonQuest, beginQuest, bumpQuestCount, completeQuest, toggleQuestStep } from '@/store/actions';
import { useQuestEvaluations } from '@/store/hooks';
import { useStore } from '@/store/store';
import { DIFFICULTY, EVIDENCE_LABEL, QUEST_CATEGORY, STATE_LABEL } from '@/features/quests/meta';
import { EmptyArt } from '@/art/EmptyArt';
import { Screen, Notice, ErrorState } from '@/ui/layout';
import { Icon } from '@/ui/Icon';
import { Button, Card, IconButton, Pill, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function QuestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act } = useStore();
  const evals = useQuestEvaluations();
  const [error, setError] = useState<string | null>(null);
  const uq = data.userQuests.find((q) => q.id === id) ?? data.userQuests.find((q) => q.questId === id && q.status === 'active');
  const def = questById(uq?.questId ?? id ?? '');
  if (!def) return <Screen back title="Quête"><ErrorState text="Cette quête n’existe pas." /></Screen>;
  const ev = uq ? evals.get(uq.id) : undefined;
  const cat = QUEST_CATEGORY[def.category];
  const run = (fn: Parameters<typeof act>[0]) => setError(act(fn));

  return (
    <Screen back>
      <View style={{ alignItems: 'center', marginBottom: space.md }}>
        <EmptyArt kind="quest" />
      </View>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Pill label={cat.label.toUpperCase()} color={colors.quest} bg={colors.questSoft} icon={cat.icon} />
        <Pill label={DIFFICULTY[def.difficulty].label.toUpperCase()} color={colors.textMuted} bg={colors.surfaceAlt} />
        <Pill label={`+${def.xp} XP`} color={colors.rewardInk} bg={colors.rewardSoft} icon="star" />
      </Row>
      <T v="title" style={{ marginTop: space.sm }}>
        {def.title}
      </T>
      <T color={colors.textMuted} style={{ marginTop: 4 }}>
        {def.description}
      </T>

      <Card style={{ marginTop: space.md, gap: 6 }} tone={colors.surfaceAlt}>
        <T v="bodyStrong">Comment elle est validée</T>
        <T v="small" color={colors.textMuted}>
          {def.rule.type === 'category_reduction'
            ? 'À la fin de la période, VAULT compare tes dépenses de la catégorie avec la période précédente de même durée. Il faut une banque connectée sans erreur, synchronisée après la fin de la période, un historique suffisant et des opérations bien catégorisées. Sinon, rien n’est validé automatiquement.'
            : def.rule.type === 'budget_respected'
              ? 'Ton budget de la catégorie doit être respecté sur toute la durée. Avec des données bancaires fiables, la validation est automatique ; en saisie manuelle, tu confirmes toi-même.'
              : def.rule.type === 'manual_checklist' || def.rule.type === 'manual_count'
                ? 'Ces actions ne se voient pas dans les données bancaires : tu les déclares toi-même, honnêtement.'
                : def.rule.type === 'savings_during' || def.rule.type === 'vault_total'
                  ? 'Calculé à partir des sommes enregistrées dans ton coffre (déclarées ou virements confirmés).'
                  : 'Calculé à partir de ton activité dans VAULT.'}
        </T>
        {def.manualFallback ? (
          <T v="small" color={colors.textMuted}>
            Si les données ne permettent pas de vérifier, tu pourras la déclarer réussie toi-même ; elle sera marquée « déclarée ».
          </T>
        ) : null}
      </Card>

      {!uq ? (
        <Button label="Commencer la quête" icon="flag" style={{ marginTop: space.lg }} onPress={() => {
          let newId: string | null = null;
          const err = act((d, env) => {
            const r = beginQuest(d, def.id, env);
            newId = r.data.userQuests.at(-1)?.id ?? null;
            return r;
          });
          if (err) setError(err);
          else if (newId) router.replace(`/quest/${newId}`);
        }} />
      ) : (
        <>
          <SectionTitle title="Progression" />
          <Card style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" color={colors.textMuted}>
                Du {shortDate(uq.startDate)} au {shortDate(uq.endDate)}
              </T>
              {ev ? <Pill label={STATE_LABEL[ev.state].label} color={STATE_LABEL[ev.state].color} bg={STATE_LABEL[ev.state].bg} /> : null}
            </Row>
            <ProgressBar value={ev?.progress ?? 0} color={colors.quest} track={colors.questSoft} height={12} label="Progression de la quête" />
            <T v="small">{ev?.detail}</T>
            {uq.status === 'completed' && uq.evidence ? (
              <Row gap={6}>
                <Icon name="check" size={16} color={colors.success} />
                <T v="small" color={colors.success}>
                  {EVIDENCE_LABEL[uq.evidence]}
                </T>
              </Row>
            ) : null}
          </Card>

          {uq.status === 'active' && def.rule.type === 'manual_checklist' ? (
            <Card style={{ marginTop: space.md, gap: space.sm }}>
              {def.rule.steps.map((step, i) => {
                const checked = uq.checkedSteps.includes(i);
                return (
                  <Pressable key={i} onPress={() => run((d, env) => toggleQuestStep(d, uq.id, i, env))} accessibilityRole="checkbox" accessibilityState={{ checked }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <View style={{ width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: checked ? colors.quest : colors.border, backgroundColor: checked ? colors.quest : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {checked ? <Icon name="check" size={15} color={colors.onColor} strokeWidth={3} /> : null}
                    </View>
                    <T style={{ flex: 1, textDecorationLine: checked ? 'line-through' : 'none' }} color={checked ? colors.textMuted : colors.text}>
                      {step}
                    </T>
                  </Pressable>
                );
              })}
            </Card>
          ) : null}

          {uq.status === 'active' && def.rule.type === 'manual_count' ? (
            <Card style={{ marginTop: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <IconButton icon="minus" label="Retirer un" onPress={() => run((d, env) => bumpQuestCount(d, uq.id, -1, env))} bg={colors.surfaceAlt} />
                <View style={{ alignItems: 'center' }}>
                  <T v="hero">{uq.manualCount}</T>
                  <T v="small" color={colors.textMuted}>
                    {def.rule.unit} sur {def.rule.target}
                  </T>
                </View>
                <IconButton icon="plus" label="Ajouter un" onPress={() => run((d, env) => bumpQuestCount(d, uq.id, 1, env))} bg={colors.questSoft} color={colors.quest} />
              </Row>
            </Card>
          ) : null}

          {error ? <View style={{ marginTop: space.md }}><Notice tone="alert" text={error} /></View> : null}

          {uq.status === 'active' && ev ? (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              {ev.state === 'ready' ? <Button kind="reward" icon="trophy" label={`Valider et gagner ${def.xp} XP`} onPress={() => run((d, env) => completeQuest(d, uq.id, ev, false, env))} /> : null}
              {ev.canDeclareManually && ev.state !== 'ready' ? (
                <>
                  {ev.state === 'insufficient_data' ? <Notice tone="warning" text={ev.detail} /> : null}
                  <Button kind="secondary" icon="check" label="Je déclare l’avoir réussie" onPress={() => run((d, env) => completeQuest(d, uq.id, ev, true, env))} />
                </>
              ) : null}
              <Button kind="ghost" label="Abandonner la quête" onPress={() => { run((d, env) => abandonQuest(d, uq.id, env)); router.back(); }} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
