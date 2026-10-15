// POST /functions/v1/bank-institutions   Corps : { country?: "FR" }
// Liste des banques proposées par le prestataire, quand le choix se fait dans VAULT (Enable Banking).
import { corsHeaders, getProvider, json, log, readJson, requireUser } from '../_shared/server/context.ts';
import { ProviderError } from '../_shared/banking/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const provider = getProvider();
  if (!provider) return json({ error: 'provider_not_configured' }, 503);
  // Bridge et Powens affichent leur propre sélecteur de banque.
  if (!provider.listInstitutions) return json({ institutions: [], pickInProvider: true });
  const body = await readJson<{ country?: string }>(req);
  const country = body?.country && /^[A-Z]{2}$/.test(body.country) ? body.country : 'FR';
  try {
    return json({ institutions: await provider.listInstitutions(country), pickInProvider: false });
  } catch (e) {
    log('bank_institutions_failed', { code: e instanceof ProviderError ? e.code : 'internal' });
    return json({ error: 'provider_error' }, 502);
  }
});
