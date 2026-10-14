import type { Transaction } from '../supabase/functions/_shared/domain/transactions.ts';

let n = 0;
export function tx(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amountMinor' | 'label'>): Transaction {
  n++;
  return {
    id: partial.id ?? `t${n}`,
    source: 'bank',
    currency: 'EUR',
    status: 'booked',
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}
