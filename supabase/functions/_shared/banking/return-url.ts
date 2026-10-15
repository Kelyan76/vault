// Adresse de retour vers l'appli après le parcours bancaire.
// Seules les adresses de l'appli sont acceptées, pour qu'un lien de retour ne puisse pas renvoyer ailleurs :
// appli installée (vault://), Expo Go (exp://), aperçu local, et les sites web déclarés dans ALLOWED_RETURN_ORIGINS.

const APP = /^(vault|exp|exps):\/\/[^\s"'<>]*$|^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/[^\s"'<>]*$/;

/** « https://vault.vercel.app, https://autre.fr » → liste d'origines exactes. */
export function parseOrigins(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(s));
}

export function safeReturnUrl(candidate: unknown, webOrigins: string[] = []): string | null {
  if (typeof candidate !== 'string' || candidate.length > 300 || /[\s"'<>]/.test(candidate)) return null;
  if (APP.test(candidate)) return candidate;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  // Comparaison sur l'origine exacte : « https://vault.vercel.app.evil.com » ne passe pas.
  return url.protocol === 'https:' && webOrigins.includes(url.origin) ? candidate : null;
}

/** Ajoute les paramètres de résultat à l'adresse de retour (Expo Go utilise « exp://hôte:port/--/chemin »). */
export function withParams(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `${base}${base.includes('?') ? '&' : '?'}${q}`;
}
