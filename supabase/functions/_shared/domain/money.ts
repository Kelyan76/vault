// Montants en unités mineures (centimes) : jamais de flottants pour l'argent.
// Chaque montant porte sa devise : rien ne suppose que tout est en euros.

export interface Money {
  amountMinor: number;
  currency: string;
}

const MINOR_DIGITS: Record<string, number> = { JPY: 0, KRW: 0, BHD: 3, KWD: 3, TND: 3 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Convertit un montant décimal reçu d'un prestataire (ex. 12.3) en unités mineures. */
export function toMinor(value: number, currency: string): number {
  if (!Number.isFinite(value)) throw new Error('Montant invalide');
  const factor = 10 ** minorDigits(currency);
  return Math.round(value * factor);
}

export function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** minorDigits(currency);
}

/** Lit une saisie utilisateur (« 12,50 », « 12.5 », « 1 200 ») en unités mineures positives. */
export function parseAmountInput(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
  const digits = minorDigits(currency);
  const decimals = cleaned.split('.')[1]?.length ?? 0;
  if (decimals > digits) return null;
  return toMinor(value, currency);
}

export function formatMoney(amountMinor: number, currency: string, opts?: { signed?: boolean }): string {
  const value = fromMinor(amountMinor, currency);
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      signDisplay: opts?.signed ? 'exceptZero' : 'auto',
    }).format(value);
  } catch {
    const sign = opts?.signed && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(minorDigits(currency))} ${currency}`;
  }
}

export function sumByCurrency(items: Money[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of items) out[m.currency] = (out[m.currency] ?? 0) + m.amountMinor;
  return out;
}
