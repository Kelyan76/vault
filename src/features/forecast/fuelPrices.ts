import { departmentPrefix, type Energy } from '@shared/domain/forecast.ts';

// Prix officiels des carburants : flux instantané publié par l'État (prix-carburants.gouv.fr),
// diffusé en données ouvertes sur data.economie.gouv.fr. Moyenne des stations mises à jour depuis 7 jours,
// sur le département du code postal, sinon sur toute la France. L'électricité n'y figure pas.

const API = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

/** Champ du jeu de données pour chaque carburant de VAULT. */
const FIELD: Partial<Record<Energy, string>> = {
  sp95: 'e10',
  sp98: 'sp98',
  gazole: 'gazole',
  e85: 'e85',
  gpl: 'gplc',
};

export interface FuelPrices {
  /** Centimes par litre, par carburant (absent si aucune station ne le vend dans la zone). */
  prices: Partial<Record<Energy, number>>;
  stations: number;
  scope: string;
  fetchedAt: string;
}

async function query(where: string | null): Promise<{ row: Record<string, number | null>; stations: number }> {
  const select = Object.values(FIELD)
    .map((f) => `avg(${f}_prix) as ${f}`)
    .concat('count(*) as stations')
    .join(',');
  const recent = Object.values(FIELD)
    .map((f) => `${f}_maj >= now(days=-7)`)
    .join(' or ');
  const params = new URLSearchParams({ select, limit: '1', where: where ? `(${where}) and (${recent})` : recent });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`prix ${res.status}`);
  const json = (await res.json()) as { results?: Record<string, number | null>[] };
  const row = json.results?.[0] ?? {};
  return { row, stations: Number(row.stations ?? 0) };
}

export async function fetchFuelPrices(postalCode?: string | null): Promise<FuelPrices> {
  const dep = departmentPrefix(postalCode);
  let scope = 'Moyenne France';
  let result = dep ? await query(`startswith(cp, "${dep}")`) : null;
  if (result && result.stations >= 3) {
    scope = `Moyenne du département ${dep}`;
  } else {
    result = await query(null);
  }
  const prices: Partial<Record<Energy, number>> = {};
  for (const [energy, field] of Object.entries(FIELD) as [Energy, string][]) {
    const v = result.row[field];
    if (typeof v === 'number' && v > 0.3 && v < 5) prices[energy] = Math.round(v * 100);
  }
  return { prices, stations: result.stations, scope, fetchedAt: new Date().toISOString() };
}
