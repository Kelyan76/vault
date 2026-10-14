import { formatMoney } from '@shared/domain/money.ts';

export const money = (amountMinor: number, currency = 'EUR', signed = false) => formatMoney(amountMinor, currency, { signed });

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export function shortDate(d: string): string {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
}

export function weekday(d: string): string {
  return DAYS[new Date(`${d.slice(0, 10)}T12:00:00`).getDay()];
}

/** « il y a 5 min », « hier à 14:02 »… pour la date de dernière synchronisation. */
export function relativeTime(iso: string | null): string {
  if (!iso) return 'jamais';
  const t = new Date(iso);
  const diff = Date.now() - t.getTime();
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  const hh = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  if (diff < 24 * 3600_000 && t.getDate() === new Date().getDate()) return `aujourd’hui à ${hh}`;
  if (diff < 48 * 3600_000) return `hier à ${hh}`;
  return `le ${shortDate(iso)} à ${hh}`;
}

export function monthName(d: string): string {
  return ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][Number(d.slice(5, 7)) - 1];
}
