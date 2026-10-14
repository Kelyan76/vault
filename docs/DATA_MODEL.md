# Modèle de données (PostgreSQL / Supabase)

Migrations : `supabase/migrations/`. Toutes testées dans PGlite (`npm run test:db`).

## Conventions

- Identifiants `uuid`, clés étrangères vers `auth.users(id) on delete cascade` : supprimer le compte supprime tout (testé).
- Montants en **unités mineures** (`bigint`, centimes) avec une colonne `currency char(3)` : jamais de flottant, jamais d'euro implicite.
- `created_at`, `updated_at` (trigger `touch_updated_at`), `synced_at` sur les données importées.
- RLS activée sur toutes les tables privées ; les tables « officielles » sont en plus protégées par `revoke insert/update/delete` (double barrière).

## Tables

| Domaine | Table | Écriture client | Notes |
|---|---|---|---|
| Profil | `profiles` | mise à jour de soi | pseudo unique, avatar, devise, préférences, partage dans les défis |
| Progression | `user_progress`, `xp_transactions` | **non** | `award_xp()` réservé au serveur, clé d'idempotence unique |
| Badges | `achievements`, `user_achievements` | **non** | catalogue + déblocages |
| Banque | `bank_provider_users` | **aucun accès** | id utilisateur chez le prestataire |
| | `bank_connections` | **non** ; lecture limitée aux colonnes non sensibles | `provider_connection_id` illisible côté client ; vue `my_bank_connections` |
| | `bank_accounts` | **non** | solde nullable, devise nullable, IBAN réduit aux 4 derniers caractères |
| | `bank_transactions` | **non** | unique `(connection_id, provider_transaction_id)`, `status`, `removed` |
| | `transaction_category_overrides` | oui, sur ses propres opérations | survit aux synchros, supprimée avec l'opération |
| | `sync_jobs` | **non** | index unique partiel « une synchro running par connexion » |
| | `bank_connect_attempts`, `webhook_events` | **aucun accès** | `state` à usage unique ; anti-rejeu des webhooks |
| Saisie | `manual_transactions` | oui | catégorie et nature choisies |
| Budget | `budgets`, `budget_categories` | oui | une limite par catégorie et période |
| Coffre | `savings_goals`, `savings_transactions`, `goal_allocations` | oui | `kind` = `declared` / `observed_transfer` ; un virement observé une seule fois (unique) et seulement depuis sa propre opération débitrice |
| | `avoided_expenses` | oui | estimation séparée ; `set_aside_entry_id` = mise de côté réelle distincte |
| Habitudes | `habits`, `habit_completions`, `habit_pauses` | oui | pas de validation future ni de rattrapage > 2 jours |
| Quêtes | `quests` | **non** | catalogue généré depuis `domain/quests.ts` (`npm run gen:quests`), test d'égalité |
| | `user_quests` | démarrer, progression déclarée, abandonner | `completed` uniquement via `validate-quest` |
| | `weekly_reviews` | via `complete_weekly_review()` | semaine ISO calculée par le serveur |
| Social | `friendships`, `user_blocks`, `challenges`, `challenge_participants`, `abuse_reports` | selon politiques | score partagé non modifiable par le participant |
| Audit | `audit_log` | **non** | `user_id` mis à null à la suppression du compte |

## Fonctions SQL

- `award_xp`, `unlock_achievement`, `audit`, `begin_sync`, `finalize_bank_disconnection` : serveur uniquement.
- `complete_weekly_review`, `claim_goal_reward` (refusé pour un objectif < 10 € ou créé il y a moins de 24 h), `refresh_challenge_score`, `public_profiles`, `find_profile_by_pseudo`, `my_data_summary` : appelables par l'utilisateur connecté, contrôles internes.

## Choix notables

- Les données du prestataire et les corrections de l'utilisateur sont dans des tables séparées : une resynchronisation n'efface jamais une correction (testé).
- Les transactions supprimées chez le prestataire sont marquées `removed`, pas effacées, pour expliquer l'historique ; elles sont exclues de tous les calculs.
- Les mises de côté du coffre survivent à la suppression des données bancaires (lien remis à null) : l'utilisateur ne perd pas sa progression.
