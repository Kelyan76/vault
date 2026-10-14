# VAULT

Application mobile (iOS, Android) de finances personnelles gamifiées : quêtes, objectifs d'épargne, coffre virtuel, habitudes, badges et défis entre amis, avec connexion bancaire via un prestataire d'open banking.

Expo SDK 57 · React Native 0.86 · TypeScript strict · Expo Router · Reanimated 4 · react-native-svg · Supabase (Auth, PostgreSQL + RLS, Edge Functions).

```bash
npm install
```

```bash
npm start
```

```bash
npm run check
```

## État au 14 octobre 2026

| Fonction | État |
|---|---|
| Design system, navigation, 31 écrans avec états vide / erreur / chargement | Fait, vérifié dans l'aperçu web |
| Mode démo (banque, amis, objectifs fictifs, clairement signalés) | Fait |
| Mode « mes données » sur le téléphone : saisie manuelle, catégories, budgets, statistiques | Fait |
| Quêtes, XP, niveaux, badges, habitudes avec pauses, coffre, objectifs, dépenses évitées | Fait (règles testées) |
| Défis et amis | Démo : fait. Comptes réels : amis branchés sur Supabase (non testé contre un vrai projet) ; écran des défis réels à faire |
| Compte en ligne (Supabase Auth) | Écrans et logique faits ; **bloqué** : aucun projet Supabase configuré |
| Connexion bancaire réelle (Bridge) | Client, synchronisation, webhooks, révocation écrits d'après la doc officielle et testés avec des réponses simulées ; **bloqué** : aucun identifiant prestataire |
| Données personnelles dans Supabase (objectifs, budgets…) | Schéma + RLS faits et testés ; la synchronisation appli ↔ serveur de ces données reste à faire (aujourd'hui sur le téléphone) |
| Notifications push | Préférences seulement |

Rien n'est prêt pour la production : voir [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — lancer, tester, brancher Supabase et Bridge
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — organisation, flux bancaire, règles des quêtes
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — tables, RLS, choix du modèle
- [docs/BANKING_PROVIDERS.md](docs/BANKING_PROVIDERS.md) — comparaison Bridge / Powens et sources
- [docs/COMPLIANCE.md](docs/COMPLIANCE.md) — obligations avant publication

## Structure

```
src/app/                 écrans (Expo Router)
src/features/            logique d'écran par domaine (banque, quêtes, coffre, social, auth)
src/store/               état local, actions pures, données de démo
src/ui/, src/art/        design system, graphiques, illustrations SVG
src/theme/tokens.ts      palette et rôles des couleurs
supabase/functions/_shared/domain   règles métier partagées appli + serveur
supabase/functions/_shared/banking  BankingProvider, Bridge, banque démo, synchronisation
supabase/functions/*     Edge Functions
supabase/migrations/     schéma PostgreSQL + RLS
tests/                   tests Node (+ tests/db : PostgreSQL réel via PGlite)
```
