# Architecture de VAULT

## Vue d'ensemble

```
Appli Expo (iOS / Android / web de dev)          Supabase
┌──────────────────────────────┐                ┌───────────────────────────────────────────┐
│ src/app        écrans (Expo Router)            │ Auth (e-mail + mot de passe)               │
│ src/features   logique d'écran par domaine     │ PostgreSQL + RLS (supabase/migrations)     │
│ src/store      état local, actions pures  ─────┼─ Edge Functions (Deno)                     │
│ src/ui, src/art design system, illustrations   │   bank-connect / bank-callback / bank-sync │
│                                                │   bank-webhook / bank-disconnect           │
│        importe ▼                               │   validate-quest / delete-account          │
│ supabase/functions/_shared  (TypeScript pur, partagé appli + serveur)                      │
│   domain/   argent, dates, catégorisation, agrégation, budgets, XP, quêtes, coffre, défis  │
│   banking/  BankingProvider, Bridge, banque démo, fusion des transactions, webhooks        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │ HTTPS (secrets côté serveur)
                                                         ▼
                                                 Prestataire d'open banking (Bridge)
```

**Une seule source de vérité pour les règles.** Le code de `supabase/functions/_shared/domain` et `_shared/banking` est du TypeScript pur (aucune dépendance React Native ni Deno), importé :
- par l'appli via l'alias `@shared/*` ;
- par les Edge Functions en import relatif ;
- par les tests Node (`node --test`, qui exécute le TypeScript directement).

Ces fichiers n'utilisent que de la syntaxe « effaçable » (pas d'`enum`) et des imports avec extension `.ts`, pour fonctionner dans les trois environnements.

## Espaces de données

L'appli a deux espaces qui ne se mélangent jamais (`src/store/types.ts`, `Space`) :

- **démo** : banque fictive « Banque Démo (fictive) », amis fictifs, objectifs d'exemple. Bandeau « Mode démo · données fictives » sur chaque écran, étiquettes « DÉMO / FICTIF » sur les données ;
- **mes données** : vide au départ. Stocké sur le téléphone (localStorage d'`expo-sqlite`) tant qu'aucun compte n'existe. Avec un compte Supabase, les connexions bancaires réelles sont lues sur le serveur (RLS).

## Connexion bancaire

1. L'appli affiche avantages, données lues / jamais lues, et demande un consentement explicite (versionné).
2. `bank-connect` (JWT requis) : crée l'utilisateur chez Bridge (`external_user_id` = id VAULT), enregistre une tentative avec un `state` aléatoire à usage unique (30 min), crée la session Connect et renvoie l'URL.
3. L'appli ouvre l'URL avec `WebBrowser.openAuthSessionAsync`. L'utilisateur s'authentifie chez sa banque, jamais dans VAULT.
4. `bank-callback` (sans JWT) : consomme le `state`, **relit l'item chez Bridge avec le jeton de l'utilisateur** (on ne croit pas les paramètres d'URL), enregistre la connexion, accorde une seule fois la récompense « première connexion », lance la synchro initiale en arrière-plan et redirige vers `vault://bank/callback`.
5. `runSync` (`_shared/banking/orchestrator.ts`) : verrou SQL (`begin_sync`, un seul job « running » par connexion), état de l'item, comptes, transactions paginées (`next_uri` validé), fusion idempotente, curseur incrémental avec recouvrement de 10 min, nouvelle tentative exponentielle en cas d'erreur.
6. `bank-webhook` : signature `BridgeApi-Signature` vérifiée, événements trop anciens refusés, rejeu bloqué (hash du corps en clé primaire), puis synchro.
7. `bank-disconnect` : révocation chez Bridge **d'abord** ; si elle échoue, la connexion n'est pas marquée déconnectée. Puis suppression facultative des données importées.

## Transactions

- Clé de déduplication : `(connection_id, provider_transaction_id)` + upsert. Rejouer un lot ne change rien.
- Une version plus ancienne (webhook en retard) n'écrase jamais une plus récente (`provider_updated_at`).
- Opérations en attente : comptées à part, jamais dans les dépenses confirmées. Supprimées par le prestataire → `removed = true` (gardées pour l'historique, exclues des calculs).
- Corrections de catégorie dans `transaction_category_overrides`, jamais dans la ligne importée.
- Transferts internes : paire débit/crédit de même montant entre deux comptes de l'utilisateur (±3 jours). Vers un compte d'épargne → « versement vers l'épargne », compté une fois (jambe sortante).
- Remboursements : crédit reconnu comme tel → réduit la catégorie de la dépense, n'est pas un revenu.
- Devises : agrégations par devise, aucune conversion ; les autres devises sont signalées.

## Quêtes et récompenses

- Règles dans `domain/quests.ts`. Une quête basée sur la banque n'est validée automatiquement que si les données sont fiables : connexion saine, synchronisée après la fin de la période, historique couvrant la période de comparaison, moins de 25 % d'opérations non catégorisées. Sinon : état « À vérifier » et, si la quête le permet, déclaration manuelle explicite marquée « déclarée ».
- Serveur : la complétion passe par `validate-quest`, qui réévalue avec le même moteur. Le client ne peut ni écrire `status = 'completed'` (RLS + privilèges de colonnes) ni appeler `award_xp`.
- XP idempotente : clé unique `(user_id, idempotency_key)`, montants 1–500, seuils de niveau identiques en SQL et en TypeScript (testé).
- Les récompenses ne dépendent jamais d'un solde, d'un revenu ni d'une comparaison de montants entre personnes.

## Social

Les amis ne voient que pseudo et avatar (`public_profiles`, `find_profile_by_pseudo`) et les scores des défis (`shared_score`, entier borné, calculé par `refresh_challenge_score` à partir du nombre d'actions ou du pourcentage d'un objectif). Partage désactivable. Signalement, blocage, retrait d'ami, sortie de défi.

## Journalisation

`log()` des Edge Functions n'écrit que des noms d'événements, statuts et codes. Jamais de jeton, secret, IBAN, libellé ni montant. `audit_log` garde les actions sensibles (connexion, déconnexion, suppression, quête validée) sans détail financier ; anonymisé à la suppression du compte.
