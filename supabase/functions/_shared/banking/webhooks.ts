// Vérification d'authenticité des webhooks, avec l'API Web Crypto (Deno, Node 20+, navigateurs).

const encoder = new TextEncoder();

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Comparaison en temps constant pour ne pas révéler la signature attendue. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Bridge : en-tête `BridgeApi-Signature` contenant une ou plusieurs entrées `v1=<hmac>` séparées par des virgules
 * (deux pendant les 24 h qui suivent une rotation du secret). HMAC-SHA256 du corps brut avec le secret du webhook.
 * Seul le schéma v1 est accepté (protection contre les attaques par rétrogradation).
 */
export async function verifyBridgeSignature(rawBody: string, header: string | null, secrets: string[]): Promise<boolean> {
  if (!header || secrets.length === 0) return false;
  const received = header
    .split(',')
    .map((part) => part.trim().split('='))
    .filter(([scheme, value]) => scheme === 'v1' && !!value)
    .map(([, value]) => value.toLowerCase());
  if (received.length === 0) return false;
  for (const secret of secrets) {
    const expected = toHex(await hmacSha256(secret, rawBody));
    if (received.some((r) => timingSafeEqual(r, expected))) return true;
  }
  return false;
}

/**
 * Powens (mode « hmac_signature ») : en-têtes `BI-Signature-Date` et `BI-Signature`,
 * signature = Base64(HMAC-SHA256(secret, `${méthode}.${endpoint}.${date}.${corps}`)).
 * La date est aussi contrôlée pour refuser les requêtes rejouées.
 */
export async function verifyPowensSignature(
  req: { method: string; endpoint: string; rawBody: string; signature: string | null; signatureDate: string | null },
  secret: string,
  now: Date,
  maxSkewMs = 5 * 60 * 1000,
): Promise<boolean> {
  if (!req.signature || !req.signatureDate || !secret) return false;
  const date = new Date(req.signatureDate);
  if (Number.isNaN(date.getTime()) || Math.abs(now.getTime() - date.getTime()) > maxSkewMs) return false;
  const expected = toBase64(await hmacSha256(secret, `${req.method.toUpperCase()}.${req.endpoint}.${req.signatureDate}.${req.rawBody}`));
  return timingSafeEqual(req.signature, expected);
}

/** Bridge horodate ses événements en millisecondes : on refuse ceux qui sont trop anciens. */
export function isFreshEvent(timestampMs: number, now: Date, maxAgeMs = 3 * 24 * 60 * 60 * 1000): boolean {
  return Number.isFinite(timestampMs) && now.getTime() - timestampMs <= maxAgeMs && timestampMs - now.getTime() <= 5 * 60 * 1000;
}
