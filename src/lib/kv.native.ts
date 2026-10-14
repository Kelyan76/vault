// Stockage clé-valeur persistant sur téléphone : localStorage fourni par expo-sqlite.
import 'expo-sqlite/localStorage/install';

export const kv = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : l'appli continue en mémoire */
    }
  },
  remove(key: string) {
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      /* idem */
    }
  },
  storage: () => globalThis.localStorage,
};
