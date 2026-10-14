# Conformité — à traiter avant toute publication

VAULT **n'est pas prêt pour la production**. Une connexion bancaire qui fonctionne techniquement ne rend pas l'appli conforme. Cette liste n'est pas un avis juridique : la faire valider par un juriste spécialisé.

## Open banking (DSP2)

- [ ] Statut juridique de VAULT vis-à-vis du prestataire : l'accès aux comptes (service d'information sur les comptes) est un service de paiement réglementé. VAULT doit opérer sous le statut du prestataire (contrat, éventuellement statut d'agent ou équivalent) ou obtenir son propre agrément. À clarifier contractuellement avec Bridge ou Powens.
- [ ] Conditions d'utilisation du prestataire acceptées, obligations d'affichage (mentions du prestataire dans le parcours de consentement).
- [ ] Renouvellement du consentement (authentification forte, en général tous les 180 jours) : affiché dans l'appli (« Consentement expiré ») ; vérifier les délais réels par banque.
- [ ] Procédure de révocation documentée et testée en sandbox (endpoints `DELETE` Bridge).

## Données personnelles (RGPD)

- [ ] Registre des traitements, base légale (exécution du contrat / consentement pour l'accès bancaire), durées de conservation (historique bancaire, journaux d'audit).
- [ ] Analyse d'impact (AIPD) : données financières + profilage léger (quêtes) → probablement requise.
- [ ] Politique de confidentialité et mentions légales publiées, contact du responsable de traitement.
- [ ] Sous-traitants : Supabase (région d'hébergement UE à choisir), prestataire bancaire, Expo/EAS. Contrats (DPA) signés.
- [ ] Droits des personnes : accès, export (à développer), rectification, suppression (implémentée : `delete-account`, testée en base).
- [ ] Mineurs : âge minimum à fixer (les services bancaires en ligne imposent souvent la majorité).

## Sécurité

- [ ] Revue des politiques RLS par une seconde personne (tests fournis : `tests/db/rls.test.ts`).
- [ ] Chiffrement applicatif des identifiants prestataire si l'on stocke un jeton permanent (cas Powens) — non nécessaire avec Bridge, qui délivre des jetons temporaires.
- [ ] Rotation des secrets, comptes séparés dev / prod, MFA sur les consoles Supabase, Bridge, EAS.
- [ ] Limitation de débit sur l'authentification (paramètres Supabase Auth).
- [ ] Tests de pénétration avant ouverture publique.

## Présentation

- [ ] Ne jamais présenter VAULT comme une banque, un conseiller financier ou un produit d'épargne : le coffre est un outil de suivi (mention présente dans l'appli).
- [ ] Les soldes affichés sont ceux de la dernière synchronisation, pas en temps réel (mention présente).
- [ ] Accessibilité : rôles et libellés posés sur les composants principaux ; audit complet VoiceOver / TalkBack à faire sur appareils réels.
