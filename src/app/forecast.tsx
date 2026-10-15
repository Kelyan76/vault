import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  actualMonthlyAverage,
  CAR_MODELS,
  DEFAULT_FUEL,
  DEFAULT_GROCERY,
  DEFAULT_PRICE_MINOR,
  ENERGY_LABELS,
  fuelForecast,
  GROCERY_LEVEL_LABELS,
  GROCERY_WEEKLY_MINOR,
  groceryForecast,
  validateFuel,
  validateGrocery,
  type Energy,
  type FuelInput,
  type GroceryInput,
  type GroceryLevel,
} from '@shared/domain/forecast.ts';
import { applyForecastBudgets, saveForecast } from '@/store/actions';
import { useDataQuality, useProjection, useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Screen, Notice } from '@/ui/layout';
import { Icon } from '@/ui/Icon';
import { Button, Card, Chip, Field, IconButton, Row, SectionTitle, T } from '@/ui/primitives';
import { money, shortDate } from '@/ui/format';
import { colors, fonts, radius, space } from '@/theme/tokens';

function Stepper({ label, hint, value, onChange, max = 15 }: { label: string; hint?: string; value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{label}</T>
        {hint ? (
          <T v="small" color={colors.textMuted}>
            {hint}
          </T>
        ) : null}
      </View>
      <Row gap={10}>
        <IconButton icon="minus" label={`Moins : ${label}`} onPress={() => onChange(Math.max(0, value - 1))} bg={colors.cardHigh} />
        <T v="number" style={{ minWidth: 34, textAlign: 'center', fontSize: 22 }}>
          {value}
        </T>
        <IconButton icon="plus" label={`Plus : ${label}`} onPress={() => onChange(Math.min(max, value + 1))} bg={colors.primary} color={colors.onPrimary} />
      </Row>
    </Row>
  );
}

/** Saisie décimale (« 6,5 ») ; renvoie null si invalide. */
const parseNum = (s: string) => {
  const v = Number(s.replace(',', '.').replace(/\s/g, ''));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};
const fmt = (n: number) => String(n).replace('.', ',');

export default function Forecast() {
  const { data, act, today } = useStore();
  const txs = useTransactions();
  const quality = useDataQuality();
  const cur = data.profile.currency;
  const [grocery, setGrocery] = useState<GroceryInput>(data.forecast?.grocery ?? DEFAULT_GROCERY);
  const [fuel, setFuel] = useState<FuelInput>(data.forecast?.fuel ?? DEFAULT_FUEL);
  // Champs texte libres, convertis à la validation.
  const [km, setKm] = useState(fmt(fuel.kmOneWay));
  const [extra, setExtra] = useState(fmt(fuel.extraKmPerWeek));
  const [per100, setPer100] = useState(fmt(fuel.per100));
  const [price, setPrice] = useState(fmt(fuel.priceMinor / 100));
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'alert'; text: string } | null>(null);

  const fuelInput: FuelInput = {
    ...fuel,
    kmOneWay: parseNum(km) ?? -1,
    extraKmPerWeek: parseNum(extra) ?? -1,
    per100: parseNum(per100) ?? -1,
    priceMinor: Math.round((parseNum(price) ?? -1) * 100),
  };
  const gErr = validateGrocery(grocery);
  const fErr = validateFuel(fuelInput);
  const g = gErr ? null : groceryForecast(grocery);
  const f = fErr ? null : fuelForecast(fuelInput);
  const unit = ENERGY_LABELS[fuel.energy].unit;

  const realGroceries = useMemo(() => actualMonthlyAverage(txs, 'groceries', cur, today, quality.coverageFrom ?? (quality.mode === 'manual' ? '0000-01-01' : null)), [txs, cur, today, quality]);
  const realTransport = useMemo(() => actualMonthlyAverage(txs, 'transport', cur, today, quality.coverageFrom ?? (quality.mode === 'manual' ? '0000-01-01' : null)), [txs, cur, today, quality]);

  const models = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? CAR_MODELS.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search]);
  const model = CAR_MODELS.find((m) => m.id === fuel.carModelId);

  function pickModel(id: string) {
    const m = CAR_MODELS.find((x) => x.id === id)!;
    setFuel({ ...fuel, carModelId: m.id, energy: m.energy, per100: m.per100, priceMinor: DEFAULT_PRICE_MINOR[m.energy] });
    setPer100(fmt(m.per100));
    setPrice(fmt(DEFAULT_PRICE_MINOR[m.energy] / 100));
    setSearch('');
  }

  function pickEnergy(e: Energy) {
    setFuel({ ...fuel, energy: e, carModelId: null });
    setPrice(fmt(DEFAULT_PRICE_MINOR[e] / 100));
    if (e === 'electrique' && (parseNum(per100) ?? 0) < 10) setPer100('16');
    if (e !== 'electrique' && (parseNum(per100) ?? 0) > 20) setPer100('6');
  }

  function save(withBudgets: boolean) {
    const input = { grocery, fuel: fuelInput };
    const err = act((d, env) => (withBudgets ? applyForecastBudgets(d, input, env) : saveForecast(d, input, env)));
    setMsg(err ? { tone: 'alert', text: err } : { tone: 'success', text: withBudgets ? 'Budgets mensuels « Alimentation » et « Transport » créés à partir de ta prévision.' : 'Prévision enregistrée.' });
  }

  const total = (g?.monthlyMinor ?? 0) + (f?.monthlyMinor ?? 0);
  const proj = useProjection();

  return (
    <Screen back title="Prévisions" subtitle="Ce qu’il te restera à la fin du mois, et le détail de tes courses et de ton essence.">
      {proj ? (
        <Card style={{ gap: space.sm, marginBottom: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Fin du mois</T>
            <T v="tiny" color={colors.textMuted}>
              AU {shortDate(today).toUpperCase()} · {proj.daysLeft} J RESTANTS
            </T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T color={colors.textMuted}>Solde actuel</T>
            <T v="bodyStrong" style={{ fontFamily: fonts.mono }}>
              {money(proj.balanceMinor, cur)}
            </T>
          </Row>
          {proj.lines.map((l, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <T v="small" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
                {l.label}
                {l.day ? ` · le ${l.day}` : ''}
              </T>
              <T v="small" style={{ fontFamily: fonts.mono }} color={l.amountMinor > 0 ? colors.success : colors.text}>
                {money(l.amountMinor, cur, true)}
              </T>
            </Row>
          ))}
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Solde prévu le {shortDate(proj.endOfMonth)}</T>
            <T v="number" style={{ fontSize: 22 }} color={proj.projectedMinor < 0 ? colors.alert : colors.primary}>
              {money(proj.projectedMinor, cur)}
            </T>
          </Row>
          <T v="small" color={colors.textMuted}>
            {proj.referenceMonths
              ? `Estimation sans aucune rentrée d’argent à venir (ni salaire, ni virement reçu) : prélèvements réguliers repérés sur ${proj.referenceMonths > 1 ? `tes ${proj.referenceMonths} derniers mois complets` : 'ton dernier mois complet'}, autres dépenses au prorata des jours restants${data.forecast ? ', courses et carburant selon ta prévision enregistrée' : ''}. Les opérations en attente ne sont pas encore dans ton solde.`
              : 'Historique trop court pour repérer tes opérations régulières : la prévision s’affinera après un mois complet de données.'}
          </T>
        </Card>
      ) : null}
      <View style={{ backgroundColor: colors.reward, borderRadius: radius.lg, padding: space.lg, gap: 4 }}>
        <T v="heading" color={colors.onColor}>
          Prévision du mois
        </T>
        <T v="numberXL" color={colors.onColor}>
          {money(total, cur)}
        </T>
        <T v="small" color={colors.onColor}>
          Courses {g ? money(g.monthlyMinor, cur) : '—'} · Carburant {f ? money(f.monthlyMinor, cur) : '—'}
        </T>
      </View>

      <SectionTitle title="Courses du foyer" />
      <Card style={{ gap: space.md }}>
        <Stepper label="Adultes" value={grocery.adults} onChange={(n) => setGrocery({ ...grocery, adults: n })} />
        <Stepper label="Ados" hint="12 à 17 ans" value={grocery.teens} onChange={(n) => setGrocery({ ...grocery, teens: n })} />
        <Stepper label="Enfants" hint="3 à 11 ans" value={grocery.children} onChange={(n) => setGrocery({ ...grocery, children: n })} />
        <Stepper label="Bébés" hint="moins de 3 ans, hors couches et lait" value={grocery.babies} onChange={(n) => setGrocery({ ...grocery, babies: n })} />
        <Stepper label="Repas pris dehors" hint="par semaine pour tout le foyer (cantine, resto)" value={grocery.mealsOutPerWeek} onChange={(n) => setGrocery({ ...grocery, mealsOutPerWeek: n })} max={60} />
        <View style={{ gap: 8 }}>
          <T v="small" color={colors.textMuted}>
            Ton style de courses
          </T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(GROCERY_LEVEL_LABELS) as GroceryLevel[]).map((l) => (
              <Chip key={l} label={GROCERY_LEVEL_LABELS[l]} selected={grocery.level === l} onPress={() => setGrocery({ ...grocery, level: l })} />
            ))}
          </Row>
        </View>
        {gErr ? <Notice tone="alert" text={gErr} /> : null}
        {g ? (
          <View style={{ gap: 4, backgroundColor: colors.cardHigh, borderRadius: radius.md, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" color={colors.textMuted}>
                Estimation
              </T>
              <T v="number" style={{ fontSize: 22 }}>
                {money(g.monthlyMinor, cur)}
                <T v="small" color={colors.textMuted}>
                  {' '}/ mois
                </T>
              </T>
            </Row>
            <T v="small" color={colors.textMuted}>
              Soit {money(g.weeklyMinor, cur)} par semaine pour {g.persons} personne{g.persons > 1 ? 's' : ''}.
            </T>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <T v="small" color={colors.textMuted}>
                Tes vraies courses
              </T>
              <T v="bodyStrong" style={{ fontFamily: fonts.mono }}>
                {realGroceries.monthlyMinor !== null ? `${money(realGroceries.monthlyMinor, cur)} / mois` : 'pas assez de données'}
              </T>
            </Row>
            {realGroceries.monthlyMinor !== null ? (
              <T v="small" color={colors.textMuted}>
                Moyenne de la catégorie « Alimentation » sur {realGroceries.months} mois complet{realGroceries.months > 1 ? 's' : ''}.
              </T>
            ) : null}
          </View>
        ) : null}
        <T v="small" color={colors.textMuted}>
          Repères indicatifs choisis pour VAULT, pas des statistiques officielles : en « {GROCERY_LEVEL_LABELS[grocery.level]} », {money(GROCERY_WEEKLY_MINOR[grocery.level].adult, cur)} par adulte et par semaine. Ajuste le style pour coller à tes tickets.
        </T>
      </Card>

      <SectionTitle title="Carburant" />
      <Card style={{ gap: space.md }}>
        <Field label="Modèle de ta voiture" value={search} onChangeText={setSearch} placeholder={model ? model.name : 'ex. Clio, 208, Yaris…'} autoCorrect={false} />
        {models.length ? (
          <View style={{ gap: 2, marginTop: -8 }}>
            {models.map((m) => (
              <Pressable key={m.id} onPress={() => pickModel(m.id)} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
                <T v="bodyStrong">{m.name}</T>
                <T v="small" color={colors.textMuted}>
                  {fmt(m.per100)} {ENERGY_LABELS[m.energy].unit}/100
                </T>
              </Pressable>
            ))}
          </View>
        ) : search.trim().length > 1 ? (
          <T v="small" color={colors.textMuted}>
            Modèle absent de la liste : choisis le carburant et indique ta consommation ci-dessous.
          </T>
        ) : null}
        {model ? (
          <Row gap={8}>
            <Icon name="check" size={16} color={colors.primary} />
            <T v="small">
              {model.name} : consommation indicative {fmt(model.per100)} {unit}/100 km, à remplacer par la tienne si tu la connais.
            </T>
          </Row>
        ) : null}
        <View style={{ gap: 8 }}>
          <T v="small" color={colors.textMuted}>
            Carburant
          </T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(ENERGY_LABELS) as Energy[]).map((e) => (
              <Chip key={e} label={ENERGY_LABELS[e].label} selected={fuel.energy === e} onPress={() => pickEnergy(e)} />
            ))}
          </Row>
        </View>
        <Field label="Domicile → travail, aller simple (km)" value={km} onChangeText={setKm} keyboardType="decimal-pad" maxLength={6} />
        <Stepper label="Jours de travail" hint="par semaine, en voiture" value={fuel.workDaysPerWeek} onChange={(n) => setFuel({ ...fuel, workDaysPerWeek: n })} max={7} />
        <Field label="Autres trajets (km par semaine)" hint="courses, loisirs, week-ends" value={extra} onChangeText={setExtra} keyboardType="decimal-pad" maxLength={6} />
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field label={`Conso (${unit}/100 km)`} value={per100} onChangeText={setPer100} keyboardType="decimal-pad" maxLength={5} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`Prix (€/${unit})`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={6} />
          </View>
        </Row>
        <T v="small" color={colors.textMuted}>
          Prix par défaut indicatif : vérifie-le à la pompe ou sur ta facture d’électricité, il change souvent.
        </T>
        {fErr ? <Notice tone="alert" text={fErr} /> : null}
        {f ? (
          <View style={{ gap: 4, backgroundColor: colors.cardHigh, borderRadius: radius.md, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" color={colors.textMuted}>
                Estimation
              </T>
              <T v="number" style={{ fontSize: 22 }}>
                {money(f.monthlyMinor, cur)}
                <T v="small" color={colors.textMuted}>
                  {' '}/ mois
                </T>
              </T>
            </Row>
            <T v="small" color={colors.textMuted}>
              {f.kmPerMonth} km par mois, environ {fmt(f.unitsPerMonth)} {unit}. Dont {money(f.commuteMonthlyMinor, cur)} pour aller au travail.
            </T>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <T v="small" color={colors.textMuted}>
                Ta catégorie Transport
              </T>
              <T v="bodyStrong" style={{ fontFamily: fonts.mono }}>
                {realTransport.monthlyMinor !== null ? `${money(realTransport.monthlyMinor, cur)} / mois` : 'pas assez de données'}
              </T>
            </Row>
            {realTransport.monthlyMinor !== null ? (
              <T v="small" color={colors.textMuted}>
                Tout compris (carburant, train, péages…), moyenne sur {realTransport.months} mois complet{realTransport.months > 1 ? 's' : ''}.
              </T>
            ) : null}
          </View>
        ) : null}
      </Card>

      {msg ? <View style={{ marginTop: space.md }}><Notice tone={msg.tone} text={msg.text} /></View> : null}
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Button label="Créer mes budgets du mois" icon="budget" disabled={!!gErr || !!fErr} onPress={() => save(true)} />
        <Button kind="secondary" label="Enregistrer" disabled={!!gErr || !!fErr} onPress={() => save(false)} />
        <Button kind="ghost" label="Voir mon budget" onPress={() => router.push('/(tabs)/budget')} />
      </View>
    </Screen>
  );
}
