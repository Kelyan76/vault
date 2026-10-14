-- Généré par scripts/generate-quest-seed.ts — ne pas modifier à la main.
insert into public.quests (id, title, description, category, difficulty, duration_days, xp, rule, manual_fallback) values
  ('q-save-10', 'Mettre 10 € de côté', 'Mets 10 € de côté cette semaine et enregistre-le dans ton coffre.', 'epargne', 'facile', 7, 15, '{"type":"savings_during","targetMinor":1000}'::jsonb, false),
  ('q-vault-100', 'Atteindre 100 € dans le coffre', 'Fais grimper le total suivi dans ton coffre jusqu’à 100 €, à ton rythme.', 'epargne', 'moyen', 60, 40, '{"type":"vault_total","targetMinor":10000}'::jsonb, false),
  ('q-analyse-7', 'Analyser ses dépenses 7 jours', 'Ouvre ton budget et fais le point chaque jour pendant une semaine.', 'analyse', 'moyen', 7, 30, '{"type":"review_days","target":7,"habitId":"habit-check-budget"}'::jsonb, false),
  ('q-delivery-down', 'Moins de livraisons', 'Réduis d’au moins 30 % tes dépenses « Restaurants et livraison » sur 7 jours par rapport aux 7 jours précédents.', 'reduction', 'moyen', 7, 35, '{"type":"category_reduction","category":"restaurants","reductionPct":30}'::jsonb, true),
  ('q-leisure-budget', 'Tenir son budget loisirs', 'Reste sous ton budget loisirs pendant une semaine.', 'budget', 'moyen', 7, 30, '{"type":"budget_respected","category":"leisure"}'::jsonb, true),
  ('q-subscriptions', 'Chasser un abonnement inutile', 'Passe en revue tes abonnements et repère celui que tu n’utilises plus.', 'analyse', 'facile', 7, 20, '{"type":"manual_checklist","steps":["Lister mes abonnements","Repérer celui que j’utilise le moins","Décider : garder, suspendre ou résilier"]}'::jsonb, false),
  ('q-home-meals', 'Cuisiner à la maison', 'Prépare 3 repas à la maison au lieu de commander.', 'habitude', 'facile', 7, 20, '{"type":"manual_count","target":3,"unit":"repas"}'::jsonb, false),
  ('q-impulse', 'Freiner les achats impulsifs', 'Avant chaque achat non prévu, attends 24 h. Note 3 fois où tu as résisté.', 'habitude', 'moyen', 14, 30, '{"type":"manual_count","target":3,"unit":"achats évités"}'::jsonb, false),
  ('q-weekly-review', 'Bilan de la semaine', 'Fais ton bilan financier hebdomadaire en 2 minutes.', 'analyse', 'facile', 7, 20, '{"type":"weekly_review"}'::jsonb, false),
  ('q-goal', 'Atteindre un objectif', 'Mène l’un de tes objectifs d’épargne jusqu’au bout.', 'epargne', 'difficile', 90, 60, '{"type":"goal_reached"}'::jsonb, false)
on conflict (id) do update set title = excluded.title, description = excluded.description, category = excluded.category,
  difficulty = excluded.difficulty, duration_days = excluded.duration_days, xp = excluded.xp, rule = excluded.rule,
  manual_fallback = excluded.manual_fallback;
