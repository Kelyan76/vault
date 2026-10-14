import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}

export function todayStr(now = new Date()): string {
  // Date locale de l'utilisateur (pas UTC) pour « aujourd'hui ».
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
