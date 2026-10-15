import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/** Adresse de retour vers l'appli après le parcours bancaire (appli installée, Expo Go ou site web). */
export function bankReturnUrl(): string {
  return Linking.createURL('/bank/callback');
}

/**
 * Ouvre le parcours sécurisé du prestataire.
 * - Téléphone : navigateur intégré, fermé automatiquement au retour vers l'appli.
 * - Web : la page entière part chez la banque puis revient sur /bank/callback (les fenêtres surgissantes
 *   sont souvent bloquées sur mobile). Renvoie alors 'redirected' : la suite se passe au retour.
 */
export async function openProviderFlow(url: string, returnUrl: string): Promise<{ type: 'success'; params: Record<string, string> } | { type: 'cancelled' } | { type: 'redirected' }> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return { type: 'redirected' };
  }
  const res = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (res.type !== 'success') return { type: 'cancelled' };
  return { type: 'success', params: (Linking.parse(res.url).queryParams ?? {}) as Record<string, string> };
}
