import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/config';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  signUp: (email: string, password: string, pseudo: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

/** Messages d'erreur compréhensibles, sans révéler si un e-mail existe. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Confirme d’abord ton e-mail (pense à regarder les spams).';
  if (m.includes('password should be') || m.includes('weak')) return 'Mot de passe trop faible : 10 caractères minimum, avec lettres et chiffres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (m.includes('network') || m.includes('fetch')) return 'Pas de connexion au serveur. Vérifie ton réseau.';
  return 'Une erreur est survenue. Réessaie.';
}

export function validatePassword(p: string): string | null {
  if (p.length < 10) return '10 caractères minimum.';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Mélange lettres et chiffres.';
  return null;
}

export function validateEmail(e: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) ? null : 'Adresse e-mail invalide.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      configured,
      ready,
      session,
      email: session?.user.email ?? null,
      async signUp(email, password, pseudo) {
        const sb = supabase();
        if (!sb) return { error: 'Serveur VAULT non configuré.', needsConfirmation: false };
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { pseudo: pseudo.trim() }, emailRedirectTo: Linking.createURL('/auth/sign-in') },
        });
        if (error) return { error: authErrorMessage(error.message), needsConfirmation: false };
        return { error: null, needsConfirmation: !data.session };
      },
      async signIn(email, password) {
        const sb = supabase();
        if (!sb) return 'Serveur VAULT non configuré.';
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        return error ? authErrorMessage(error.message) : null;
      },
      async resetPassword(email) {
        const sb = supabase();
        if (!sb) return 'Serveur VAULT non configuré.';
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/auth/sign-in') });
        return error ? authErrorMessage(error.message) : null;
      },
      async signOut() {
        await supabase()?.auth.signOut();
      },
    }),
    [configured, ready, session],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider manquant');
  return v;
}
