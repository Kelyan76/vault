# Prestataires d'open banking — comparaison et choix

Recherche effectuée le **14 octobre 2026** dans les documentations officielles publiques. Les points marqués « non vérifié » n'ont pas pu être confirmés dans la documentation accessible sans compte. **Les tarifs et conditions commerciales ne sont publics chez aucun des deux** : il faut les demander aux équipes commerciales.

## Synthèse

| Critère | Bridge (Bridge API v3) | Powens |
|---|---|---|
| Statut réglementaire | Établissement agréé (France) — à confirmer contractuellement | Établissement agréé (France) — à confirmer contractuellement |
| Couverture banques FR | Large (non chiffrée ici) | Large (non chiffrée ici) |
| Comptes d'épargne | Oui : `account_types: "all"` à la création de session ; types `savings`, `pea`, `life_insurance`… | Oui (types de comptes multiples) — détail non vérifié |
| Historique | `min_date` sur les transactions | `min_date` mentionné par des sources tierces — non vérifié |
| Synchro incrémentale | `since` = transactions modifiées après une date (champ `updated_at`) | `last_update` mentionné par des sources tierces — non vérifié |
| Pagination | Curseur `pagination.next_uri` | « paginated » ; mécanisme non vérifié |
| Opérations en attente / supprimées | Champs `future` et `deleted` | Non vérifié |
| Parcours de consentement | Session Connect hébergée (`POST /v3/aggregation/connect-sessions`) + `callback_url` | Webview hébergée (`webview.powens.com/connect`) + `redirect_uri` |
| Renouvellement du consentement | Session « gérer un item » (`item_id`, `force_reauthentication`) ; `authentication_expires_at` | États `SCARequired`, `webauthRequired`… |
| Webhooks | `item.created`, `item.refreshed`, `item.account.created/updated/deleted`, `item.deleted`, `user.deleted` | `CONNECTION_SYNCED`, `ACCOUNT_SYNCED`, `CONNECTION_DELETED`, `USER_DELETED`… |
| Signature des webhooks | En-tête `BridgeApi-Signature`, HMAC-SHA256 du corps, schéma `v1`, 2 secrets pendant 24 h après rotation | HMAC (`BI-Signature`, `BI-Signature-Date`) ou OAuth, configurable |
| Révocation / suppression | `DELETE /v3/aggregation/items/{id}` (supprime comptes et opérations), `DELETE /v3/aggregation/users/{uuid}` | Non vérifié dans la doc consultée |
| Sandbox | « Demo Bank » (id 574), scénarios d'erreur par identifiant (`otp`, `402`, `429`, `1003`, `success.1009`…) | Connecteurs de test (page dédiée) |
| Coûts | Non publics | Non publics |

## Choix pour l'implémentation : Bridge, en premier adaptateur

Raison : c'est la documentation v3 la plus complète que nous ayons pu **vérifier** pour l'ensemble du cycle (utilisateur → jeton → session → comptes → transactions incrémentales → suppression → webhooks signés), avec une sandbox qui simule les cas d'erreur. Ce n'est **pas** un choix commercial définitif : il dépend des tarifs, de la couverture réelle et des conditions contractuelles.

Grâce à l'interface `BankingProvider` (`supabase/functions/_shared/banking/types.ts`), passer à Powens consiste à écrire `powens.ts` sans toucher aux écrans, aux quêtes ni au moteur de synchronisation. Le mappage des états Powens est déjà écrit et testé (`status.ts`).

## Endpoints Bridge utilisés (tous vérifiés dans la référence officielle)

- `POST /v3/aggregation/users` — corps `{ external_user_id }` (identifiant interne VAULT, jamais l'e-mail)
- `POST /v3/aggregation/authorization/token` — `{ user_uuid }` → `access_token`, `expires_at`
- `POST /v3/aggregation/connect-sessions` — `callback_url`, `context` (notre `state`), `user_email`, `country_code`, `account_types`, ou `item_id` pour renouveler
- `GET /v3/aggregation/items/{id}` — `status`, `status_code_info`, `authentication_expires_at`, `last_successful_refresh`
- `GET /v3/aggregation/accounts?item_id=` — `balance`, `currency_code`, `type`, `data_access`, `iban`
- `GET /v3/aggregation/transactions?since=&min_date=&limit=` — `amount` (signé), `deleted`, `future`, `updated_at`, `category_id`, `operation_type`
- `DELETE /v3/aggregation/items/{id}` et `DELETE /v3/aggregation/users/{uuid}`

En-têtes : `Bridge-Version: 2025-01-15`, `Client-Id`, `Client-Secret`, et `Authorization: Bearer <jeton utilisateur>` pour les appels « utilisateur ».

Paramètres de retour du parcours Connect : `user_uuid`, `item_id`, `success`, `step`, `source`, `context`.

## États de connexion (correspondance)

Bridge (`docs.bridgeapi.io/docs/items-status`) : `0` OK ; `-2`/`-3` rafraîchissement en cours ; `402` identifiants erronés ; `429` action requise dans la banque en ligne ; `1003` échec, réessayer ; `1005` compte non pris en charge ; `1007` rafraîchissement désactivé temporairement ; `1009` solde modifié sans nouvelle opération (normal) ; `1010` MFA/OTP requis ; `1099` migration ; `1100` comptes pro à valider. Un `authentication_expires_at` dépassé donne « consentement expiré ».

## Ce qui reste à faire avant la vraie connexion

1. Créer un compte développeur Bridge, récupérer les identifiants **sandbox**.
2. Déclarer l'URL de retour `https://<projet>.supabase.co/functions/v1/bank-callback` dans la console Bridge (domaines de redirection autorisés).
3. Créer le webhook vers `.../functions/v1/bank-webhook` et récupérer son secret.
4. Renseigner les secrets serveur (voir `docs/SETUP.md`), puis tester avec « Demo Bank ».
5. Remplir la correspondance des catégories Bridge (`GET /v3/aggregation/categories`) dans `ProviderCategoryMap` : aucune catégorie n'a été inventée.
6. Vérifier la signature des webhooks contre de vrais événements sandbox (format hexadécimal confirmé seulement par des sources tierces).

## Sources

- Bridge — fin du parcours Connect : https://docs.bridgeapi.io/docs/end-of-the-connect-flow
- Bridge — créer un utilisateur : https://docs.bridgeapi.io/reference/createuser
- Bridge — jeton : https://docs.bridgeapi.io/reference/createuserauthtoken
- Bridge — session Connect : https://docs.bridgeapi.io/reference/createconnectsession
- Bridge — comptes : https://docs.bridgeapi.io/reference/getaccounts
- Bridge — transactions : https://docs.bridgeapi.io/reference/gettransactions
- Bridge — supprimer un item / un utilisateur : https://docs.bridgeapi.io/reference/deleteitem · https://docs.bridgeapi.io/reference/deleteuser
- Bridge — webhooks et événements : https://docs.bridgeapi.io/docs/webhooks · https://docs.bridgeapi.io/docs/webhooks-events · https://docs.bridgeapi.io/docs/secure-your-webhooks
- Bridge — états des items : https://docs.bridgeapi.io/docs/items-status
- Bridge — sandbox : https://docs.bridgeapi.io/docs/test-the-bridge-connect
- Powens — premier utilisateur et connexion : https://docs.powens.com/documentation/integration-guides/quick-start/add-a-first-user-and-connection
- Powens — webhooks : https://docs.powens.com/documentation/integration-guides/webhooks
- Powens — SCA et états de connexion : https://docs.powens.com/documentation/integration-guides/sca-and-connection-states
- Powens — transactions : https://docs.powens.com/documentation/integration-guides/transactions/transactions-integration-guide
