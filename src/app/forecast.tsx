import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  actualMonthlyAverage,
  CAR_MODELS,
  daysLeftInMonth,
  DEFAULT_FUEL,
  DEFAULT_GROCERY,
  DEFAULT_PRICE_MINOR,
  ENERGY_LABELS,
  fuelRemaining,
  GROCERY_LEVEL_LABELS,
  GROCERY_WEEKLY_MINOR,
  groceryForecast,
  groceryRemainingMinor,
  TANK_BY_MODEL,
  validateFuel,
  validateGrocery,
  type Energy,
  type FuelInput,
  type GroceryInput,
  type GroceryLevel,
} from '@shared/domain/forecast.ts';
import { parseAmountInput } from '@shared/domain/money.ts';
import { addFixedItem, applyForecastBudgets, removeFixedItem, saveForecast } from '@/store/actions';
import { useDataQuality, useProjection, useTransactions } from '@/store/hooks';
import { useStore } from '@/store/store';
import { fetchFuelPrices, type FuelPrices } from '@/features/forecast/fuelPrices';
import { Screen, Notice } from '@/ui/layout';
import { Icon } from '@/ui/Icon';
import { Button, Card, Chip, Field, IconButton, Row, SectionTitle, T } from '@/ui/primitives';
import { money, relativeTime, shortDate } from '@/ui/format';
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
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

const GAUGES: { label: string; value: number | null }[] = [
  { label: 'Réserve', value: 0.08 },
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
  { label: 'Plein', value: 1 },
  { label: 'Je ne sais pas', value: null },
];

function FixedItems() {
  const { data, act } = useStore();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [keyword, setKeyword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const cur = data.profile.currency;
  const items = [...(data.fixedItems ?? [])].sort((a, b) => a.day - b.day);

  function add() {
    const minor = parseAmountInput(amount, cur);
    const d = Number(day);
    if (!minor) return setMsg('Montant invalide (ex. 497).');
    const err = act((x, env) => addFixedItem(x, { label, amountMinor: minor, day: d, direction, keyword }, env));
    setMsg(err);
    if (!err) {
      setLabel('');
      setAmount('');
      setDay('');
      setKeyword('');
    }
  }

  return (
    <Card style={{ gap: space.md }}>
      <T v="small" color={colors.textMuted}>
        Ce qui tombe à date fixe chaque mois, comme le loyer ou les APL. Chaque montant est compté tant que sa date n’est pas passée ce mois-ci.
      </T>
      {items.length ? (
        <View style={{ gap: 8 }}>
          {items.map((it) => (
            <Row key={it.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: it.direction === 'in' ? colors.primarySoft : colors.questSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T v="tiny" color={it.direction === 'in' ? colors.primary : colors.quest}>
                  LE {it.day}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{it.label}</T>
                {it.keyword ? (
                  <T v="small" color={colors.textMuted}>
                    Reconnu par « {it.keyword} »
                  </T>
                ) : null}
              </View>
              <T v="bodyStrong" style={{ fontFamily: fonts.mono }} color={it.direction === 'in' ? colors.success : colors.text}>
                {money(it.direction === 'in' ? it.amountMinor : -it.amountMinor, cur, true)}
              </T>
              <IconButton icon="trash" label={`Retirer ${it.label}`} onPress={() => act((x, env) => removeFixedItem(x, it.id, env))} bg={colors.cardHigh} />
            </Row>
          ))}
        </View>
      ) : null}
      <View style={{ gap: space.sm, backgroundColor: colors.cardHigh, borderRadius: radius.md, padding: space.md }}>
        <Row gap={8}>
          <Chip label="Sortie" selected={direction === 'out'} onPress={() => setDirection('out')} color={colors.quest} />
          <Chip label="Entrée" selected={direction === 'in'} onPress={() => setDirection('in')} />
        </Row>
        <Field label="Nom" value={label} onChangeText={setLabel} placeholder={direction === 'out' ? 'ex. Loyer' : 'ex. APL'} maxLength={40} />
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field label={`Montant (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={direction === 'out' ? '497' : '344'} maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Le (jour du mois)" value={day} onChangeText={setDay} keyboardType="number-pad" placeholder={direction === 'out' ? '10' : '5'} maxLength={2} />
          </View>
        </Row>
        <Field label="Mot du libellé bancaire (facultatif)" hint="ex. LOYER ou CAF : aide VAULT à reconnaître l’opération" value={keyword} onChangeText={setKeyword} autoCapitalize="characters" maxLength={30} />
        {msg ? <Notice tone="alert" text={msg} /> : null}
        <Button small label="Ajouter" icon="plus" onPress={add} />
      </View>
    </Card>
  );
}

export default function Forecast() {
  const { data, act, today } = useStore();
  const txs = useTransactions();
  const quality = useDataQuality();
  const proj = useProjection();
  const cur = data.profile.currency;
  const saved = data.forecast;
  const [grocery, setGrocery] = useState<GroceryInput>(saved?.grocery ?? DEFAULT_GROCERY);
  const [fuel, setFuel] = useState<FuelInput>({ tankCapacity: 45, priceSource: 'auto', ...(saved?.fuel ?? DEFAULT_FUEL) });
  const [km, setKm] = useState(fmt(fuel.kmOneWay));
  const [extra, setExtra] = useState(fmt(fuel.extraKmPerWeek));
  const [per100, setPer100] = useState(fmt(fuel.per100));
  const [price, setPrice] = useState(fmt(fuel.priceMinor / 100));
  const [tank, setTank] = useState(fmt(fuel.tankCapacity ?? 45));
  const [postal, setPostal] = useState(fuel.postalCode ?? '');
  const [search, setSearch] = useState('');
  const [prices, setPrices] = useState<FuelPrices | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'alert'; text: string } | null>(null);
  const unit = ENERGY_LABELS[fuel.energy].unit;

  const fuelInput: FuelInput = {
    ...fuel,
    kmOneWay: parseNum(km) ?? -1,
    extraKmPerWeek: parseNum(extra) ?? -1,
    per100: parseNum(per100) ?? -1,
    priceMinor: Math.round((parseNum(price) ?? -1) * 100),
    tankCapacity: parseNum(tank) ?? 0,
    postalCode: postal.trim() || null,
  };
  const gErr = validateGrocery(grocery);
  const fErr = validateFuel(fuelInput);
  const g = gErr ? null : groceryForecast(grocery);
  const gLeft = gErr ? null : groceryRemainingMinor(grocery, today);
  const fLeft = fErr ? null : fuelRemaining(fuelInput, today);
  const daysLeft = daysLeftInMonth(today);

  // Prix officiels : rechargés quand le code postal change (au plus une fois par code complet).
  const postalKey = /^[0-9]{5}$/.test(postal.trim()) ? postal.trim() : '';
  useEffect(() => {
    let cancelled = false;
    setPriceError(null);
    fetchFuelPrices(postalKey || null)
      .then((p) => {
        if (!cancelled) setPrices(p);
      })
      .catch(() => {
        if (!cancelled) setPriceError('Prix officiels indisponibles pour le moment : prix de secours utilisé, modifiable.');
      });
    return () => {
      cancelled = true;
    };
  }, [postalKey]);

  // En mode automatique, le prix suit les prix officiels du carburant choisi.
  useEffect(() => {
    if (fuel.priceSource !== 'auto') return;
    const p = prices?.prices[fuel.energy];
    if (p) setPrice(fmt(p / 100));
  }, [prices, fuel.energy, fuel.priceSource]);

  // Enregistrement automatique : l'accueil utilise toujours la dernière prévision valide.
  const lastSaved = useRef('');
  useEffect(() => {
    if (gErr || fErr) return;
    const payload = JSON.stringify({ grocery, fuel: fuelInput });
    if (payload === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = payload;
      act((d, env) => saveForecast(d, { grocery, fuel: fuelInput }, env));
    }, 600);
    return () => clearTimeout(t);
  });

  const realGroceries = useMemo(() => actualMonthlyAverage(txs, 'groceries', cur, today, quality.coverageFrom ?? (quality.mode === 'manual' ? '0000-01-01' : null)), [txs, cur, today, quality]);

  const models = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? CAR_MODELS.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search]);
  const model = CAR_MODELS.find((m) => m.id === fuel.carModelId);

  function pickModel(id: string) {
    const m = CAR_MODELS.find((x) => x.id === id)!;
    setFuel({ ...fuel, carModelId: m.id, energy: m.energy, per100: m.per100 });
    setPer100(fmt(m.per100));
    setTank(fmt(TANK_BY_MODEL[m.id] ?? 45));
    if (fuel.priceSource !== 'auto' || m.energy === 'electrique') setPrice(fmt((prices?.prices[m.energy] ?? DEFAULT_PRICE_MINOR[m.energy]) / 100));
    setSearch('');
  }

  function pickEnergy(e: Energy) {
    setFuel({ ...fuel, energy: e, carModelId: null, priceSource: e === 'electrique' ? 'manual' : fuel.priceSource });
    if (e === 'electrique') setPrice(fmt(DEFAULT_PRICE_MINOR.electrique / 100));
    if (e === 'electrique' && (parseNum(per100) ?? 0) < 10) setPer100('16');
    if (e !== 'electrique' && (parseNum(per100) ?? 0) > 20) setPer100('6');
  }

  function budgets() {
    const err = act((d, env) => applyForecastBudgets(d, { grocery, fuel: fuelInput }, env));
    setMsg(err ? { tone: 'alert', text: err } : { tone: 'success', text: 'Budgets mensuels « Alimentation » et « Transport » créés à partir de ta prévision.' });
  }

  const gaugeFresh = fLeft?.usedGauge ?? false;

  return (
    <Screen back title="Prévisions" subtitle="Ce qu’il te restera à la fin du mois, calculé à partir d’aujourd’hui.">
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
            <T v="heading">Le {shortDate(proj.endOfMonth)}</T>
            <T v="number" style={{ fontSize: 22 }} color={proj.projectedMinor < 0 ? colors.alert : colors.primary}>
              {money(proj.projectedMinor, cur)}
            </T>
          </Row>
          <T v="small" color={colors.textMuted}>
            Calcul : ton solde réel, tes entrées et sorties fixes dont la date n’est pas encore passée, tes courses et ton carburant d’ici la fin du mois. Rien n’est deviné à partir de tes anciennes opérations, et aucun salaire n’est anticipé. Les opérations en attente ne sont pas encore dans ton solde.
          </T>
          {!(data.fixedItems ?? []).length ? (
            <T v="small" color={colors.reward}>
              Ajoute ton loyer et tes autres montants fixes ci-dessous pour qu’ils soient comptés.
            </T>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle title="Entrées et sorties fixes" />
      <FixedItems />

      <SectionTitle title="Courses du foyer" />
      <Card style={{ gap: space.md }}>
        <Stepper label="Adultes" value={grocery.adults} onChange={(n) => setGrocery({ ...grocery, adults: n })} />
        <Stepper label="Ados" hint="12 à 17 ans" value={grocery.teens} onChange={(n) => setGrocery({ ...grocery, teens: n })} />
        <Stepper label="Enfants" hint="3 à 11 ans" value={grocery.children} onChange={(n) => setGrocery({ ...grocery, children: n })} />
        <Stepper label="Bébés" hint="moins de 3 ans, hors couches et lait" value={grocery.babies} onChange={(n) => setGrocery({ ...grocery, babies: n })} />
        <Stepper label="Repas pris dehors" hint="par semaine pour tout le foyer (cantine, resto)" value={grocery.mealsOutPerWeek} onChange={(n) => setGrocery({ ...grocery, mealsOutPerWeek: n })} max={60} />
        <View style={{ gap: 8 }}>
          <T v="small" color={colors.textMuted}>
            Ta part des courses
          </T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {[
              { label: 'Je paie tout', value: 1 },
              { label: 'Moitié', value: 0.5 },
              { label: 'Un tiers', value: 1 / 3 },
              { label: 'Un quart', value: 0.25 },
            ].map((o) => (
              <Chip key={o.label} label={o.label} selected={Math.abs((grocery.myShare ?? 1) - o.value) < 0.01} onPress={() => setGrocery({ ...grocery, myShare: o.value })} />
            ))}
          </Row>
        </View>
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
        {g && gLeft !== null ? (
          <View style={{ gap: 4, backgroundColor: colors.cardHigh, borderRadius: radius.md, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" color={colors.textMuted}>
                D’ici la fin du mois ({daysLeft} j)
              </T>
              <T v="number" style={{ fontSize: 22 }}>
                {money(gLeft, cur)}
              </T>
            </Row>
            <T v="small" color={colors.textMuted}>
              {money(g.weeklyMinor, cur)} par semaine {(grocery.myShare ?? 1) < 1 ? `(ta part, foyer de ${g.persons})` : `pour ${g.persons} personne${g.persons > 1 ? 's' : ''}`}, soit {money(g.monthlyMinor, cur)} sur un mois entier.
            </T>
            <T v="small" color={colors.textMuted}>
              Pour comparer, tes courses passées sur ton compte : {realGroceries.monthlyMinor !== null ? `${money(realGroceries.monthlyMinor, cur)} par mois en moyenne (${realGroceries.months} mois complet${realGroceries.months > 1 ? 's' : ''})` : 'pas encore assez de données'}. Elles ne servent pas au calcul.
            </T>
          </View>
        ) : null}
        <T v="small" color={colors.textMuted}>
          Repères indicatifs choisis pour VAULT, pas des statistiques officielles : en « {GROCERY_LEVEL_LABELS[grocery.level]} », {money(GROCERY_WEEKLY_MINOR[grocery.level].adult, cur)} par adulte et par semaine.
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
            <T v="small" style={{ flex: 1 }}>
              {model.name} : {fmt(model.per100)} {unit}/100 km et {fmt(TANK_BY_MODEL[model.id] ?? 45)} {unit} de réservoir (valeurs indicatives, modifiables).
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
            <Field label={`Réservoir (${unit})`} value={tank} onChangeText={setTank} keyboardType="decimal-pad" maxLength={5} />
          </View>
        </Row>

        <View style={{ gap: 8 }}>
          <T v="small" color={colors.textMuted}>
            Ta jauge aujourd’hui
          </T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {GAUGES.map((gg) => {
              const selected = gg.value === null ? !gaugeFresh : gaugeFresh && fuel.gauge === gg.value;
              return <Chip key={gg.label} label={gg.label} selected={selected} onPress={() => setFuel({ ...fuel, gauge: gg.value, gaugeDate: gg.value === null ? null : today })} color={colors.reward} />;
            })}
          </Row>
          {fuel.gaugeDate && !gaugeFresh && fuel.gauge != null ? (
            <T v="small" color={colors.textMuted}>
              Jauge indiquée le {shortDate(fuel.gaugeDate)} : trop ancienne, mets-la à jour.
            </T>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label="Code postal" hint="pour le prix moyen de ton département" value={postal} onChangeText={setPostal} keyboardType="number-pad" maxLength={5} placeholder="76600" />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={`Prix (€/${unit})`}
                value={price}
                onChangeText={(t) => {
                  setPrice(t);
                  setFuel({ ...fuel, priceSource: 'manual' });
                }}
                keyboardType="decimal-pad"
                maxLength={6}
              />
            </View>
          </Row>
          {fuel.energy === 'electrique' ? (
            <T v="small" color={colors.textMuted}>
              Électricité : indique le prix de ton kWh (facture ou borne), il n’existe pas de prix officiel moyen.
            </T>
          ) : fuel.priceSource === 'auto' && prices?.prices[fuel.energy] ? (
            <Row gap={6}>
              <Icon name="check" size={14} color={colors.primary} />
              <T v="small" color={colors.textMuted} style={{ flex: 1 }}>
                Prix réel : {prices.scope.toLowerCase()} ({prices.stations} stations), mis à jour {relativeTime(prices.fetchedAt)}. Source : prix-carburants.gouv.fr.
              </T>
            </Row>
          ) : fuel.priceSource === 'manual' ? (
            <Pressable onPress={() => setFuel({ ...fuel, priceSource: 'auto' })} accessibilityRole="button">
              <T v="small" color={colors.primary}>
                Prix saisi à la main. Revenir au prix réel
              </T>
            </Pressable>
          ) : null}
          {priceError ? <Notice tone="warning" text={priceError} /> : null}
        </View>

        {fErr ? <Notice tone="alert" text={fErr} /> : null}
        {fLeft ? (
          <View style={{ gap: 4, backgroundColor: colors.cardHigh, borderRadius: radius.md, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" color={colors.textMuted}>
                À acheter d’ici la fin du mois
              </T>
              <T v="number" style={{ fontSize: 22 }}>
                {money(fLeft.costMinor, cur)}
              </T>
            </Row>
            <T v="small" color={colors.textMuted}>
              {fmt(fLeft.workDaysLeft)} jour{fLeft.workDaysLeft > 1 ? 's' : ''} de travail et {daysLeft} jours restants : {fLeft.kmLeft} km, {fmt(fLeft.unitsNeeded)} {unit} nécessaires
              {fLeft.usedGauge ? `, dont ${fmt(fLeft.unitsInTank)} ${unit} déjà dans le réservoir` : ''}. Il faudra en acheter {fmt(fLeft.unitsToBuy)} {unit}.
            </T>
            {!fLeft.usedGauge ? (
              <T v="small" color={colors.reward}>
                Indique ta jauge pour déduire ce qu’il te reste dans le réservoir.
              </T>
            ) : null}
          </View>
        ) : null}
      </Card>

      {msg ? <View style={{ marginTop: space.md }}><Notice tone={msg.tone} text={msg.text} /></View> : null}
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <T v="small" color={colors.textMuted} center>
          Tes réglages sont enregistrés automatiquement.
        </T>
        <Button label="Créer mes budgets du mois" icon="budget" disabled={!!gErr || !!fErr} onPress={budgets} />
        <Button kind="ghost" label="Voir mon budget" onPress={() => router.push('/(tabs)/budget')} />
      </View>
    </Screen>
  );
}
