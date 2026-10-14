import { View } from 'react-native';
import { ACHIEVEMENTS } from '@shared/domain/achievements.ts';
import { levelTitle, xpForLevel } from '@shared/domain/xp.ts';
import { useProgress } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Screen } from '@/ui/layout';
import { BadgeMedal } from '@/ui/BadgeMedal';
import { Card, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';
import { shortDate } from '@/ui/format';
import { colors, space } from '@/theme/tokens';

export default function Badges() {
  const { data } = useStore();
  const lvl = useProgress();
  const unlocked = new Map(data.achievements.map((a) => [a.id, a.at]));
  const history = [...data.xpLedger].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);

  return (
    <Screen back title="Badges et niveau" subtitle="Les badges récompensent tes habitudes, jamais le montant de ton compte.">
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading">
            Niveau {lvl.level} · {levelTitle(lvl.level)}
          </T>
          <T v="bodyStrong" color={colors.primary}>
            {lvl.xp} XP
          </T>
        </Row>
        <ProgressBar value={lvl.progress} height={12} label="Progression du niveau" />
        <T v="small" color={colors.textMuted}>
          Prochain niveau à {xpForLevel(lvl.level + 1)} XP.
        </T>
      </Card>

      <SectionTitle title={`Badges (${unlocked.size}/${ACHIEVEMENTS.length})`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked.get(a.id);
          return (
            <Card key={a.id} style={{ width: '48%', flexGrow: 1, alignItems: 'center', gap: 6, opacity: at ? 1 : 0.75 }}>
              <BadgeMedal id={a.id} color={a.color} unlocked={!!at} size={64} />
              <T v="bodyStrong" center>
                {a.title}
              </T>
              <T v="small" color={colors.textMuted} center>
                {a.description}
              </T>
              {at ? (
                <T v="tiny" color={colors.success}>
                  OBTENU LE {shortDate(at).toUpperCase()}
                </T>
              ) : null}
            </Card>
          );
        })}
      </View>

      <SectionTitle title="Dernières récompenses" />
      <Card style={{ gap: 8 }}>
        {history.length === 0 ? (
          <T color={colors.textMuted}>Termine une quête ou fais ton bilan pour gagner tes premiers XP.</T>
        ) : (
          history.map((x) => (
            <Row key={x.key} style={{ justifyContent: 'space-between' }}>
              <T v="small" style={{ flex: 1 }}>
                {x.label}
              </T>
              <T v="small" color={colors.textMuted}>
                {shortDate(x.at)}
              </T>
              <T v="bodyStrong" color={colors.primary}>
                +{x.amount}
              </T>
            </Row>
          ))
        )}
      </Card>
    </Screen>
  );
}
