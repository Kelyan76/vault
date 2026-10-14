import { addDays, startOfWeek, type DateStr, type Period } from './dates.ts';

export type HabitFrequency = 'daily' | 'weekly';

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  icon: 'eye' | 'list' | 'cart' | 'target' | 'coin';
  createdAt: string;
  archivedAt?: string | null;
}

export interface HabitCompletion {
  habitId: string;
  date: DateStr;
}

/** Une pause (vacances, coup dur) ne casse pas la série : on ne culpabilise personne. */
export interface HabitPause {
  from: DateStr;
  to: DateStr;
}

export interface StreakInfo {
  current: number;
  best: number;
  /** Début de la série en cours (clé d'idempotence des bonus). */
  currentStart: DateStr | null;
  doneInCurrentSlot: boolean;
}

function isPaused(slot: DateStr, frequency: HabitFrequency, pauses: HabitPause[]): boolean {
  const slotEnd = frequency === 'daily' ? slot : addDays(slot, 6);
  return pauses.some((p) => p.from <= slot && p.to >= slotEnd);
}

function slotOf(d: DateStr, frequency: HabitFrequency): DateStr {
  return frequency === 'daily' ? d : startOfWeek(d);
}

function prevSlot(slot: DateStr, frequency: HabitFrequency): DateStr {
  return addDays(slot, frequency === 'daily' ? -1 : -7);
}

/**
 * Série = nombre de créneaux (jours ou semaines) consécutifs réalisés.
 * Le créneau en cours ne casse pas la série tant qu'il n'est pas terminé,
 * et les créneaux en pause sont simplement ignorés.
 */
export function computeStreak(habit: Habit, completions: HabitCompletion[], today: DateStr, pauses: HabitPause[] = []): StreakInfo {
  const done = new Set(completions.filter((c) => c.habitId === habit.id).map((c) => slotOf(c.date, habit.frequency)));
  const created = slotOf(habit.createdAt.slice(0, 10), habit.frequency);
  const currentSlot = slotOf(today, habit.frequency);
  const doneNow = done.has(currentSlot);

  let current = 0;
  let currentStart: DateStr | null = null;
  let slot = doneNow ? currentSlot : prevSlot(currentSlot, habit.frequency);
  let guard = 0;
  while (slot >= created && guard++ < 3660) {
    if (done.has(slot)) {
      current++;
      currentStart = slot;
    } else if (!isPaused(slot, habit.frequency, pauses)) break;
    slot = prevSlot(slot, habit.frequency);
  }

  // Meilleure série historique.
  const sorted = [...done].sort();
  let best = 0;
  let run = 0;
  let last: DateStr | null = null;
  for (const s of sorted) {
    if (last) {
      let gapSlot = prevSlot(s, habit.frequency);
      let contiguous = true;
      while (gapSlot > last) {
        if (!isPaused(gapSlot, habit.frequency, pauses)) {
          contiguous = false;
          break;
        }
        gapSlot = prevSlot(gapSlot, habit.frequency);
      }
      run = contiguous ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    last = s;
  }
  return { current, best: Math.max(best, current), currentStart, doneInCurrentSlot: doneNow };
}

export function completionsInPeriod(completions: HabitCompletion[], period: Period, habitId?: string): number {
  return completions.filter((c) => (!habitId || c.habitId === habitId) && c.date >= period.from && c.date <= period.to).length;
}

/** Message bienveillant quand une série s'interrompt. */
export function encouragement(streak: StreakInfo): string {
  if (streak.doneInCurrentSlot) return 'Fait pour aujourd’hui, bravo.';
  if (streak.current > 0) return `Série de ${streak.current} en cours, continue quand tu peux.`;
  if (streak.best > 0) return `Ton record est de ${streak.best}. Chaque reprise compte.`;
  return 'Premier pas quand tu veux, sans pression.';
}
