import type { ClassifiedTransaction } from './aggregation.ts';
import { addDays, endOfMonth, startOfMonth, type DateStr } from './dates.ts';

// Prévisions de dépenses : courses du foyer et carburant des trajets.
// Les repères ci-dessous sont des valeurs indicatives choisies pour VAULT, ajustables par l'utilisateur ;
// ce ne sont pas des statistiques officielles. La prévision est toujours comparée aux dépenses réelles quand elles existent.

export const WEEKS_PER_MONTH = 52 / 12;

// ——— Courses ———

export type GroceryLevel = 'econome' | 'equilibre' | 'confort';

export interface GroceryInput {
  adults: number;
  teens: number; // 12-17 ans
  children: number; // 3-11 ans
  babies: number; // moins de 3 ans (hors couches et lait infantile)
  level: GroceryLevel;
  /** Repas pris hors du foyer par semaine (cantine, restaurant) pour l'ensemble du foyer : réduisent les courses. */
  mealsOutPerWeek: number;
}

/** Repères hebdomadaires par personne, en centimes, selon le niveau. */
export const GROCERY_WEEKLY_MINOR: Record<GroceryLevel, { adult: number; teen: number; child: number; baby: number }> = {
  econome: { adult: 3500, teen: 3800, child: 2500, baby: 1500 },
  equilibre: { adult: 5000, teen: 5200, child: 3500, baby: 2000 },
  confort: { adult: 7000, teen: 7000, child: 4800, baby: 2800 },
};

export const GROCERY_LEVEL_LABELS: Record<GroceryLevel, string> = {
  econome: 'Économe',
  equilibre: 'Équilibré',
  confort: 'Confort',
};

/** Repas consommés à la maison par personne et par semaine (3 repas par jour). */
const MEALS_PER_PERSON_WEEK = 21;

export function validateGrocery(i: GroceryInput): string | null {
  const counts = [i.adults, i.teens, i.children, i.babies];
  if (counts.some((n) => !Number.isInteger(n) || n < 0 || n > 15)) return 'Nombre de personnes invalide.';
  if (i.adults + i.teens + i.children + i.babies === 0) return 'Le foyer compte au moins une personne.';
  if (!Number.isInteger(i.mealsOutPerWeek) || i.mealsOutPerWeek < 0) return 'Nombre de repas invalide.';
  return null;
}

export interface GroceryForecast {
  weeklyMinor: number;
  monthlyMinor: number;
  persons: number;
  /** Part des repas pris hors du foyer, déduite des courses. */
  mealsOutShare: number;
}

export function groceryForecast(i: GroceryInput): GroceryForecast {
  const r = GROCERY_WEEKLY_MINOR[i.level];
  const base = i.adults * r.adult + i.teens * r.teen + i.children * r.child + i.babies * r.baby;
  const persons = i.adults + i.teens + i.children + i.babies;
  const totalMeals = persons * MEALS_PER_PERSON_WEEK;
  const mealsOutShare = totalMeals > 0 ? Math.min(0.6, i.mealsOutPerWeek / totalMeals) : 0;
  const weekly = Math.round(base * (1 - mealsOutShare));
  return { weeklyMinor: weekly, monthlyMinor: Math.round(weekly * WEEKS_PER_MONTH), persons, mealsOutShare };
}

// ——— Carburant ———

export type Energy = 'sp95' | 'sp98' | 'gazole' | 'e85' | 'gpl' | 'electrique';

export const ENERGY_LABELS: Record<Energy, { label: string; unit: 'L' | 'kWh' }> = {
  sp95: { label: 'SP95-E10', unit: 'L' },
  sp98: { label: 'SP98', unit: 'L' },
  gazole: { label: 'Gazole', unit: 'L' },
  e85: { label: 'E85 (bioéthanol)', unit: 'L' },
  gpl: { label: 'GPL', unit: 'L' },
  electrique: { label: 'Électrique', unit: 'kWh' },
};

/** Prix par défaut, en centimes par litre ou par kWh : à vérifier à la pompe ou sur ta facture, ils varient. */
export const DEFAULT_PRICE_MINOR: Record<Energy, number> = {
  sp95: 175,
  sp98: 185,
  gazole: 165,
  e85: 85,
  gpl: 99,
  electrique: 25,
};

export interface CarModel {
  id: string;
  name: string;
  energy: Energy;
  /** Consommation indicative en cycle mixte (L ou kWh pour 100 km), à remplacer par la vraie si connue. */
  per100: number;
}

/** Modèles courants en France, consommations indicatives arrondies. */
export const CAR_MODELS: CarModel[] = [
  { id: 'peugeot-208-puretech', name: 'Peugeot 208 1.2 PureTech', energy: 'sp95', per100: 5.4 },
  { id: 'peugeot-2008-puretech', name: 'Peugeot 2008 1.2 PureTech', energy: 'sp95', per100: 5.9 },
  { id: 'peugeot-308-bluehdi', name: 'Peugeot 308 BlueHDi', energy: 'gazole', per100: 4.8 },
  { id: 'peugeot-e208', name: 'Peugeot e-208', energy: 'electrique', per100: 15.5 },
  { id: 'renault-clio-tce', name: 'Renault Clio V TCe', energy: 'sp95', per100: 5.4 },
  { id: 'renault-clio-etech', name: 'Renault Clio E-Tech hybride', energy: 'sp95', per100: 4.3 },
  { id: 'renault-captur-tce', name: 'Renault Captur TCe', energy: 'sp95', per100: 6.0 },
  { id: 'renault-megane-dci', name: 'Renault Mégane dCi', energy: 'gazole', per100: 4.6 },
  { id: 'renault-zoe', name: 'Renault Zoé', energy: 'electrique', per100: 17.5 },
  { id: 'dacia-sandero-tce', name: 'Dacia Sandero TCe', energy: 'sp95', per100: 5.4 },
  { id: 'dacia-sandero-ecog', name: 'Dacia Sandero Eco-G (GPL)', energy: 'gpl', per100: 7.0 },
  { id: 'dacia-duster-tce', name: 'Dacia Duster TCe', energy: 'sp95', per100: 6.4 },
  { id: 'citroen-c3-puretech', name: 'Citroën C3 PureTech', energy: 'sp95', per100: 5.5 },
  { id: 'citroen-c4-puretech', name: 'Citroën C4 PureTech', energy: 'sp95', per100: 6.0 },
  { id: 'vw-polo-tsi', name: 'Volkswagen Polo 1.0 TSI', energy: 'sp95', per100: 5.4 },
  { id: 'vw-golf-tsi', name: 'Volkswagen Golf 1.5 TSI', energy: 'sp95', per100: 5.8 },
  { id: 'toyota-yaris-hybride', name: 'Toyota Yaris hybride', energy: 'sp95', per100: 3.9 },
  { id: 'toyota-chr-hybride', name: 'Toyota C-HR hybride', energy: 'sp95', per100: 4.9 },
  { id: 'fiat-500-hybrid', name: 'Fiat 500 hybride', energy: 'sp95', per100: 5.3 },
  { id: 'tesla-model-3', name: 'Tesla Model 3', energy: 'electrique', per100: 14.5 },
];

export interface FuelInput {
  /** Distance domicile-travail, aller simple, en km. */
  kmOneWay: number;
  workDaysPerWeek: number;
  /** Autres trajets (courses, loisirs), en km par semaine. */
  extraKmPerWeek: number;
  carModelId: string | null;
  energy: Energy;
  /** L ou kWh pour 100 km. */
  per100: number;
  /** Centimes par litre ou par kWh. */
  priceMinor: number;
}

export function validateFuel(i: FuelInput): string | null {
  if (!(i.kmOneWay >= 0 && i.kmOneWay <= 500)) return 'Distance aller entre 0 et 500 km.';
  if (!Number.isInteger(i.workDaysPerWeek) || i.workDaysPerWeek < 0 || i.workDaysPerWeek > 7) return 'Jours travaillés : entre 0 et 7.';
  if (!(i.extraKmPerWeek >= 0 && i.extraKmPerWeek <= 3000)) return 'Autres trajets : entre 0 et 3000 km par semaine.';
  const max = i.energy === 'electrique' ? 40 : 20;
  if (!(i.per100 > 0 && i.per100 <= max)) return `Consommation entre 0 et ${max} ${ENERGY_LABELS[i.energy].unit}/100 km.`;
  if (!(i.priceMinor > 0 && i.priceMinor <= 1000)) return 'Prix invalide.';
  return null;
}

export interface FuelForecast {
  kmPerMonth: number;
  /** Litres ou kWh par mois. */
  unitsPerMonth: number;
  monthlyMinor: number;
  commuteMonthlyMinor: number;
}

export function fuelForecast(i: FuelInput): FuelForecast {
  const commuteKmWeek = 2 * i.kmOneWay * i.workDaysPerWeek;
  const kmPerMonth = (commuteKmWeek + i.extraKmPerWeek) * WEEKS_PER_MONTH;
  const unitsPerMonth = (kmPerMonth * i.per100) / 100;
  const monthly = Math.round(unitsPerMonth * i.priceMinor);
  const commute = Math.round(((commuteKmWeek * WEEKS_PER_MONTH * i.per100) / 100) * i.priceMinor);
  return { kmPerMonth: Math.round(kmPerMonth), unitsPerMonth: Math.round(unitsPerMonth * 10) / 10, monthlyMinor: monthly, commuteMonthlyMinor: commute };
}

// ——— Comparaison avec les dépenses réelles ———

export interface ActualAverage {
  /** Moyenne mensuelle des mois complets disponibles, null si aucun mois complet couvert. */
  monthlyMinor: number | null;
  months: number;
}

/**
 * Moyenne mensuelle réelle d'une catégorie sur les derniers mois COMPLETS (le mois en cours est exclu),
 * en ne comptant que les mois entièrement couverts par les données (coverageFrom).
 */
export function actualMonthlyAverage(
  txs: ClassifiedTransaction[],
  category: string,
  currency: string,
  today: DateStr,
  coverageFrom: DateStr | null,
  maxMonths = 3,
): ActualAverage {
  let end = addDays(startOfMonth(today), -1);
  let total = 0;
  let months = 0;
  for (let k = 0; k < maxMonths; k++) {
    const from = startOfMonth(end);
    if (!coverageFrom || coverageFrom > from) break;
    for (const t of txs) {
      if (t.currency !== currency || t.status !== 'booked' || t.classified.category !== category || t.date < from || t.date > end) continue;
      if (t.classified.kind === 'expense') total += -t.amountMinor;
      if (t.classified.kind === 'refund') total -= t.amountMinor;
    }
    months++;
    end = addDays(from, -1);
  }
  return { monthlyMinor: months ? Math.max(0, Math.round(total / months)) : null, months };
}

export const DEFAULT_GROCERY: GroceryInput = { adults: 1, teens: 0, children: 0, babies: 0, level: 'equilibre', mealsOutPerWeek: 0 };
export const DEFAULT_FUEL: FuelInput = { kmOneWay: 15, workDaysPerWeek: 5, extraKmPerWeek: 30, carModelId: null, energy: 'sp95', per100: 6, priceMinor: DEFAULT_PRICE_MINOR.sp95 };

export function monthBounds(today: DateStr) {
  return { from: startOfMonth(today), to: endOfMonth(today) };
}
