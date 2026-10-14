// Version web (aperçu navigateur) : localStorage du navigateur, protégé contre les accès refusés.
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const kv = {
  get(key: string): string | null {
    try {
      return ls()?.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string) {
    memory.set(key, value);
    try {
      ls()?.setItem(key, value);
    } catch {
      /* mémoire seule */
    }
  },
  remove(key: string) {
    memory.delete(key);
    try {
      ls()?.removeItem(key);
    } catch {
      /* mémoire seule */
    }
  },
  storage: (): Storage | undefined => ls() ?? undefined,
};
