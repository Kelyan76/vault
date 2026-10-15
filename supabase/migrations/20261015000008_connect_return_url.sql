-- Adresse de retour vers l'appli, propre à chaque tentative (appli installée « vault:// », Expo Go « exp:// »,
-- aperçu web local). Contrôlée par bank-connect avant enregistrement.
alter table public.bank_connect_attempts
  add column return_url text check (return_url is null or (char_length(return_url) <= 300 and return_url ~ '^(vault|exp|exps)://|^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/'));
