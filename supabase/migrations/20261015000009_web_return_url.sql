-- Version web de l'appli : l'adresse de retour peut aussi être une page https (origine contrôlée par bank-connect
-- via ALLOWED_RETURN_ORIGINS ; la base ne garde qu'un contrôle de forme).
alter table public.bank_connect_attempts drop constraint if exists bank_connect_attempts_return_url_check;
alter table public.bank_connect_attempts
  add constraint bank_connect_attempts_return_url_check check (
    return_url is null
    or (char_length(return_url) <= 300 and return_url ~ '^(vault|exp|exps)://|^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/|^https://[A-Za-z0-9.-]+(:[0-9]+)?/')
  );
