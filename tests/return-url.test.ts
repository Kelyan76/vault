import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrigins, safeReturnUrl, withParams } from '../supabase/functions/_shared/banking/return-url.ts';

test('adresse de retour : seules les adresses de l’appli sont acceptées', () => {
  assert.equal(safeReturnUrl('vault://bank/callback'), 'vault://bank/callback');
  assert.equal(safeReturnUrl('exp://192.168.1.20:8081/--/bank/callback'), 'exp://192.168.1.20:8081/--/bank/callback');
  assert.equal(safeReturnUrl('http://localhost:8081/bank/callback'), 'http://localhost:8081/bank/callback');
  for (const bad of ['https://evil.example/x', 'http://evil.example/', 'javascript:alert(1)', 'vault://x" onload=1', 'http://localhost.evil.com/', 42, null, 'exp://' + 'a'.repeat(400)]) {
    assert.equal(safeReturnUrl(bad), null, String(bad));
  }
});

test('adresse de retour : ajout des paramètres de résultat', () => {
  assert.equal(withParams('vault://bank/callback', { status: 'success', connection: 'c1' }), 'vault://bank/callback?status=success&connection=c1');
  assert.equal(withParams('exp://h:8081/--/bank/callback?x=1', { status: 'expired' }), 'exp://h:8081/--/bank/callback?x=1&status=expired');
});

test('adresse de retour web : seulement les origines déclarées, comparées exactement', () => {
  const origins = parseOrigins('https://vault-kelyan.vercel.app/, http://pas-https.fr, n importe quoi');
  assert.deepEqual(origins, ['https://vault-kelyan.vercel.app']);
  assert.equal(safeReturnUrl('https://vault-kelyan.vercel.app/bank/callback', origins), 'https://vault-kelyan.vercel.app/bank/callback');
  assert.equal(safeReturnUrl('https://vault-kelyan.vercel.app.evil.com/bank/callback', origins), null);
  assert.equal(safeReturnUrl('https://evil.example/bank/callback', origins), null);
  assert.equal(safeReturnUrl('https://vault-kelyan.vercel.app/bank/callback'), null); // aucune origine déclarée
});
