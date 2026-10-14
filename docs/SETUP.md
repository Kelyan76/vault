# Lancer VAULT

## Prérequis

- Node.js 24 (les tests exécutent le TypeScript directement avec `node --test`).
- Un téléphone avec **Expo Go** n'est pas suffisant pour tout : `expo-sqlite` et les autres modules sont inclus dans Expo Go, mais pour une version installable il faut une *development build* (`npx eas-cli build --profile development`).

## 1. Démarrer en local (mode démo et données sur le téléphone)

```bash
npm install
```

```bash
npm start
```

Puis scanner le QR code (Expo Go) ou appuyer sur `w` pour l'aperçu web. Sans Supabase configuré, l'appli fonctionne entièrement en **démo** et en **mode local** ; le compte en ligne et la banque réelle sont affichés comme « non configurés ».

## 2. Vérifier

```bash
npm run check
```

Exécute le contrôle TypeScript puis tous les tests (règles métier, synchronisation, client Bridge simulé, webhooks, RLS PostgreSQL dans PGlite).

## 3. Brancher Supabase (développement)

1. Créer un projet Supabase **de développement** (un autre, distinct, pour la production).
2. Installer la CLI Supabase, puis lier le projet : `supabase link --project-ref <ref>`.
3. Appliquer les migrations : `supabase db push`.
4. Copier `.env.development.example` en `.env.development.local` et renseigner l'URL et la clé *publishable* (jamais la clé `service_role`).
5. Dans Auth → URL Configuration : ajouter `vault://auth/callback` aux redirections.

## 4. Brancher Bridge (sandbox)

1. Compte développeur Bridge → identifiants **sandbox**.
2. Copier `supabase/functions/.env.example` en `supabase/functions/.env`, remplir `BANKING_PROVIDER=bridge`, `BRIDGE_CLIENT_ID`, `BRIDGE_CLIENT_SECRET`, `BRIDGE_WEBHOOK_SECRETS`.
3. `supabase secrets set --env-file supabase/functions/.env`
4. `supabase functions deploy bank-connect bank-callback bank-sync bank-webhook bank-disconnect validate-quest delete-account`
5. Console Bridge : autoriser le domaine de `https://<ref>.supabase.co/functions/v1/bank-callback` et créer le webhook vers `.../bank-webhook`.
6. Synchronisation planifiée : tâche `pg_cron` appelant `bank-sync` avec `{"scheduled": true}` et la clé `service_role` (toutes les 6 h par exemple).
7. Tester avec « Demo Bank » (identifiants : voir la page sandbox de Bridge), y compris `otp`, `402`, `429`, `1003`.

> Les Edge Functions n'ont **pas** encore été exécutées : ni Deno ni la CLI Supabase n'étaient installés sur la machine de développement, et aucun identifiant Bridge n'existe. Leur logique (orchestration, fusion, client Bridge, signatures, contexte des quêtes) est couverte par des tests Node ; l'enrobage Deno reste à valider en sandbox.

## 5. Production

- Projet Supabase distinct, identifiants Bridge de **production**, variables EAS du profil `production` (`eas.json`).
- Ne pas publier avant la liste de `docs/COMPLIANCE.md`.
