import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DEMO_INSTITUTION } from '@shared/banking/demo.ts';
import { connectDemoBank } from '@/store/actions';
import { useStore } from '@/store/store';
import { useBank } from '@/features/bank/useBank';
import { bankReturnUrl, openProviderFlow } from '@/features/bank/openProvider';
import { BENEFITS, CONSENT_VERSION, DATA_ACCESSED, DATA_NOT_ACCESSED } from '@/features/bank/consent';
import { callFunction, BackendError } from '@/lib/supabase';
import { EmptyArt } from '@/art/EmptyArt';
import { Screen, Notice } from '@/ui/layout';
import { Icon, IconBubble } from '@/ui/Icon';
import { Button, Card, Field, Pill, Row, SectionTitle, T } from '@/ui/primitives';
import { colors, radius, space } from '@/theme/tokens';

export default function ConnectBank() {
  const bank = useBank();
  const { act } = useStore();
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<'intro' | 'demo-provider' | 'pick-bank'>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banks, setBanks] = useState<{ name: string; country: string }[]>([]);
  const [query, setQuery] = useState('');
  const shownBanks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return banks.filter((b) => !q || b.name.toLowerCase().includes(q)).slice(0, 60);
  }, [banks, query]);

  function explain(e: unknown) {
    const code = e instanceof BackendError ? e.code : 'unknown';
    setError(
      code === 'provider_not_configured'
        ? 'Le prestataire bancaire n’est pas encore configuré sur le serveur VAULT (identifiants fournisseur manquants). La connexion réelle est bloquée pour l’instant.'
        : code === 'too_many_attempts'
          ? 'Trop de tentatives en une heure. Réessaie un peu plus tard.'
          : 'Impossible de lancer le parcours sécurisé. Vérifie ta connexion et réessaie.',
    );
  }

  async function launch() {
    setError(null);
    if (bank.source === 'demo') return setStep('demo-provider');
    if (bank.source !== 'server') return;
    setBusy(true);
    try {
      // Avec Enable Banking, la banque se choisit dans VAULT ; Bridge affiche son propre sélecteur.
      const r = await callFunction<{ institutions: { name: string; country: string }[]; pickInProvider: boolean }>('bank-institutions', { country: 'FR' });
      if (r.pickInProvider) return await connect(null);
      setBanks(r.institutions);
      setStep('pick-bank');
    } catch (e) {
      explain(e);
    } finally {
      setBusy(false);
    }
  }

  async function connect(institution: { name: string; country: string } | null) {
    setError(null);
    setBusy(true);
    try {
      const returnUrl = bankReturnUrl();
      const { url } = await callFunction<{ url: string }>('bank-connect', { consentAccepted: true, consentVersion: CONSENT_VERSION, institution, returnUrl });
      const res = await openProviderFlow(url, returnUrl);
      if (res.type === 'redirected') return;
      if (res.type === 'success') {
        router.replace({ pathname: '/bank/callback', params: res.params });
      } else {
        setError('Parcours interrompu. Aucune connexion n’a été créée ; tu peux réessayer quand tu veux.');
      }
    } catch (e) {
      explain(e);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'pick-bank') {
    return (
      <Screen back title="Choisis ta banque" subtitle="Tu seras ensuite redirigé vers le site de ta banque pour autoriser l’accès.">
        <Field label="Rechercher" value={query} onChangeText={setQuery} placeholder="ex. Crédit Agricole" autoCorrect={false} />
        {error ? <View style={{ marginTop: space.sm }}><Notice tone="alert" text={error} /></View> : null}
        <Card style={{ marginTop: space.md, paddingVertical: space.xs }}>
          {shownBanks.length === 0 ? (
            <T color={colors.textMuted} style={{ paddingVertical: space.sm }}>
              Aucune banque ne correspond à cette recherche.
            </T>
          ) : (
            shownBanks.map((b) => (
              <Pressable
                key={`${b.country}-${b.name}`}
                disabled={busy}
                onPress={() => connect(b)}
                accessibilityRole="button"
                accessibilityLabel={b.name}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, pressed && { opacity: 0.6 }]}
              >
                <IconBubble name="bank" color={colors.habit} bg={colors.habitSoft} size={36} />
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {b.name}
                </T>
                <Icon name="right" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </Card>
        <Button kind="ghost" label="Retour" onPress={() => setStep('intro')} />
      </Screen>
    );
  }

  if (step === 'demo-provider') {
    return (
      <Screen back title="Parcours du prestataire (simulé)">
        <Notice tone="warning" text="Simulation de démonstration : aucune vraie banque n’est contactée et aucune donnée réelle n’est utilisée. Dans la version réelle, cette étape s’ouvre chez le prestataire agréé, puis chez ta banque." />
        <Card style={{ marginTop: space.md, gap: space.sm }}>
          <T v="heading">Choisis ta banque</T>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primary }} accessibilityRole="radio" accessibilityState={{ selected: true }}>
            <IconBubble name="bank" color={colors.demo} bg={colors.demoSoft} />
            <T v="bodyStrong" style={{ flex: 1 }}>
              {DEMO_INSTITUTION}
            </T>
            <Icon name="check" color={colors.primary} />
          </Pressable>
          <T v="small" color={colors.textMuted}>
            Ici, ta vraie banque te demanderait de t’authentifier dans son propre espace sécurisé.
          </T>
          <Button
            label="Autoriser l’accès (fictif)"
            icon="shield"
            onPress={() => {
              const err = act((d, env) => connectDemoBank(d, env));
              if (err) return setError(err);
              router.replace({ pathname: '/bank/callback', params: { status: 'success', demo: '1' } });
            }}
          />
          <Button kind="ghost" label="Annuler" onPress={() => setStep('intro')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Connecter ma banque" subtitle="Via un prestataire d’open banking agréé. Tu peux te déconnecter à tout moment.">
      <View style={{ alignItems: 'center' }}>
        <EmptyArt kind="bank" />
      </View>
      {bank.source === 'demo' ? <Notice tone="info" text="Mode démo : le parcours ci-dessous utilise une banque fictive." /> : null}

      <SectionTitle title="Pourquoi connecter ?" />
      <Card style={{ gap: space.sm }}>
        {BENEFITS.map((b) => (
          <Row key={b.text}>
            <IconBubble name={b.icon} color={colors.habit} bg={colors.habitSoft} size={36} />
            <T style={{ flex: 1 }}>{b.text}</T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Ce que VAULT pourra lire" />
      <Card style={{ gap: 8 }}>
        {DATA_ACCESSED.map((d) => (
          <Row key={d} style={{ alignItems: 'flex-start' }}>
            <Icon name="check" size={18} color={colors.success} />
            <T v="small" style={{ flex: 1 }}>
              {d}
            </T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Ce que VAULT ne verra jamais" />
      <Card style={{ gap: 8 }}>
        {DATA_NOT_ACCESSED.map((d) => (
          <Row key={d} style={{ alignItems: 'flex-start' }}>
            <Icon name="x" size={18} color={colors.alert} />
            <T v="small" style={{ flex: 1 }}>
              {d}
            </T>
          </Row>
        ))}
        <T v="small" color={colors.textMuted}>
          Tes amis ne voient jamais ces données. Elles servent uniquement à ton budget et à vérifier tes quêtes.
        </T>
      </Card>

      {bank.source === 'unavailable' ? (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <Notice tone="warning" text={bank.unavailableReason!} />
          <Button kind="secondary" label="Saisir mes dépenses à la main" icon="plus" onPress={() => router.replace('/transactions/new')} />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setConsent(!consent)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: space.lg, padding: space.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1.5, borderColor: consent ? colors.primary : colors.border }}
          >
            <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: consent ? colors.primary : colors.border, backgroundColor: consent ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {consent ? <Icon name="check" size={15} color="#fff" strokeWidth={3} /> : null}
            </View>
            <T v="small" style={{ flex: 1 }}>
              J’accepte que VAULT accède, via le prestataire, aux données listées ci-dessus pour les comptes que je choisirai. Je peux retirer cet accord à tout moment depuis « Connexions bancaires ». (version {CONSENT_VERSION})
            </T>
          </Pressable>
          {error ? <View style={{ marginTop: space.sm }}><Notice tone="alert" text={error} /></View> : null}
          <Button label="Continuer vers le parcours sécurisé" icon="lock" disabled={!consent} loading={busy} onPress={launch} style={{ marginTop: space.md }} />
          <Row gap={6} style={{ marginTop: space.sm, justifyContent: 'center' }}>
            <Pill label="TU NE SAISIS JAMAIS TON MOT DE PASSE DANS VAULT" color={colors.textMuted} bg={colors.surfaceAlt} icon="lock" />
          </Row>
        </>
      )}
    </Screen>
  );
}
