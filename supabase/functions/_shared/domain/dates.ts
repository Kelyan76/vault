// Dates « calendrier » au format YYYY-MM-DD, calculées en UTC pour rester
// déterministes quel que soit le fuseau du téléphone ou du serveur.

export type DateStr = string;

const DAY_MS = 86_400_000;

export function toDateStr(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function parseDate(s: DateStr): Date {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw new Error(`Date invalide : ${s}`);
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

export function addDays(s: DateStr, n: number): DateStr {
  return toDateStr(new Date(parseDate(s).getTime() + n * DAY_MS));
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / DAY_MS);
}

/** Lundi de la semaine ISO contenant la date. */
export function startOfWeek(s: DateStr): DateStr {
  const d = parseDate(s);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(s, -dow);
}

export function startOfMonth(s: DateStr): DateStr {
  return `${s.slice(0, 7)}-01`;
}

export function endOfMonth(s: DateStr): DateStr {
  const d = parseDate(startOfMonth(s));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return addDays(toDateStr(d), -1);
}

/** Clé de semaine ISO, ex. « 2026-W42 ». Sert de clé d'idempotence hebdomadaire. */
export function isoWeekKey(s: DateStr): string {
  const d = parseDate(s);
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d.getTime() + (3 - dow) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export interface Period {
  from: DateStr; // inclus
  to: DateStr; // inclus
}

export type PeriodKind = 'week' | 'month';

export function periodContaining(s: DateStr, kind: PeriodKind): Period {
  if (kind === 'week') {
    const from = startOfWeek(s);
    return { from, to: addDays(from, 6) };
  }
  return { from: startOfMonth(s), to: endOfMonth(s) };
}

export function previousPeriod(p: Period, kind: PeriodKind): Period {
  if (kind === 'week') return { from: addDays(p.from, -7), to: addDays(p.to, -7) };
  const prevEnd = addDays(p.from, -1);
  return { from: startOfMonth(prevEnd), to: prevEnd };
}

export function inPeriod(s: DateStr, p: Period): boolean {
  const d = s.slice(0, 10);
  return d >= p.from && d <= p.to;
}

export function lastNDays(today: DateStr, n: number): Period {
  return { from: addDays(today, -(n - 1)), to: today };
}
