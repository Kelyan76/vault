import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { kv } from '@/lib/kv';
import { newId, nowIso, todayStr } from '@/lib/ids';
import type { Env, Result } from './actions';
import { demoUserData, emptyUserData } from './seed';
import type { ActionEffects, Meta, Space, UserData } from './types';

const KEYS = { meta: 'vault.v1.meta', demo: 'vault.v1.space.demo', personal: 'vault.v1.space.personal' } as const;

function load<T>(key: string): T | null {
  const raw = kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function makeEnv(space: Space): Env {
  return { now: nowIso(), today: todayStr(), id: newId, space };
}

interface StoreValue {
  meta: Meta;
  space: Space;
  data: UserData;
  today: string;
  /** Exécute une action pure ; renvoie l'erreur éventuelle (message pour l'utilisateur). */
  act: (fn: (data: UserData, env: Env) => Result) => string | null;
  /** Comme act, mais sur un espace précis (ex. juste après un changement d'espace). */
  actOn: (space: Space, fn: (data: UserData, env: Env) => Result) => string | null;
  setMeta: (patch: Partial<Meta>) => void;
  switchSpace: (space: Space) => void;
  resetSpace: (space: Space) => void;
  effects: ActionEffects | null;
  consumeEffects: () => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [meta, setMetaState] = useState<Meta>(() => load<Meta>(KEYS.meta) ?? { onboarded: false, space: 'demo', tutorialSeen: false });
  const [spaces, setSpaces] = useState<Partial<Record<Space, UserData>>>(() => ({
    demo: load<UserData>(KEYS.demo) ?? undefined,
    personal: load<UserData>(KEYS.personal) ?? undefined,
  }));
  const [effects, setEffects] = useState<ActionEffects | null>(null);
  const [today, setToday] = useState(todayStr());

  // Création paresseuse des espaces.
  const data = useMemo(() => {
    const existing = spaces[meta.space];
    if (existing) return existing;
    return meta.space === 'demo' ? demoUserData(makeEnv('demo')) : emptyUserData(nowIso(), todayStr());
  }, [spaces, meta.space]);

  const dataRef = useRef(data);
  dataRef.current = data;
  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;

  useEffect(() => {
    if (!spaces[meta.space]) setSpaces((s) => ({ ...s, [meta.space]: data }));
  }, [data, meta.space, spaces]);

  // Persistance (après rendu, regroupée).
  useEffect(() => {
    const t = setTimeout(() => {
      if (spaces.demo) kv.set(KEYS.demo, JSON.stringify(spaces.demo));
      if (spaces.personal) kv.set(KEYS.personal, JSON.stringify(spaces.personal));
    }, 250);
    return () => clearTimeout(t);
  }, [spaces]);

  useEffect(() => {
    kv.set(KEYS.meta, JSON.stringify(meta));
  }, [meta]);

  // Changement de jour pendant que l'appli est ouverte.
  useEffect(() => {
    const i = setInterval(() => setToday(todayStr()), 60_000);
    return () => clearInterval(i);
  }, []);

  const act = useCallback(
    (fn: (d: UserData, env: Env) => Result) => {
      const r = fn(dataRef.current, makeEnv(meta.space));
      if (r.error) return r.error;
      dataRef.current = r.data;
      setSpaces((s) => ({ ...s, [meta.space]: r.data }));
      if (r.effects.xp.length || r.effects.badges.length || r.effects.levelUp) setEffects(r.effects);
      return null;
    },
    [meta.space],
  );

  const actOn = useCallback((target: Space, fn: (d: UserData, env: Env) => Result) => {
    const current = spacesRef.current[target] ?? (target === 'demo' ? demoUserData(makeEnv('demo')) : emptyUserData(nowIso(), todayStr()));
    const r = fn(current, makeEnv(target));
    if (r.error) return r.error;
    spacesRef.current = { ...spacesRef.current, [target]: r.data };
    setSpaces((s) => ({ ...s, [target]: r.data }));
    return null;
  }, []);

  const setMeta = useCallback((patch: Partial<Meta>) => setMetaState((m) => ({ ...m, ...patch })), []);
  const switchSpace = useCallback((space: Space) => setMetaState((m) => ({ ...m, space })), []);
  const resetSpace = useCallback((space: Space) => {
    kv.remove(KEYS[space]);
    setSpaces((s) => ({ ...s, [space]: undefined }));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ meta, space: meta.space, data, today, act, actOn, setMeta, switchSpace, resetSpace, effects, consumeEffects: () => setEffects(null) }),
    [meta, data, today, act, actOn, setMeta, switchSpace, resetSpace, effects],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider manquant');
  return v;
}
