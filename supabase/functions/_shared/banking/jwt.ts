// Jetons JWT RS256 signés avec une clé privée RSA (format PEM PKCS#8), via Web Crypto (Deno et Node).

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Accepte une clé PEM, éventuellement stockée sur une ligne avec des « \n » littéraux. */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  if (normalized.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('Clé au format PKCS#1 : convertir en PKCS#8 (BEGIN PRIVATE KEY).');
  }
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '');
  if (!body) throw new Error('Clé privée vide.');
  const bin = atob(body);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

export async function signJwtRs256(key: CryptoKey, header: Record<string, unknown>, claims: Record<string, unknown>): Promise<string> {
  const input = `${base64urlJson({ typ: 'JWT', alg: 'RS256', ...header })}.${base64urlJson(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)));
  return `${input}.${base64url(sig)}`;
}
