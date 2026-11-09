-- Conserta a regra do nome dos templates (migração 0011): o Postgres não aceita repetição acima
-- de 255 numa expressão regular ({1,512}), então todo insert em message_templates falhava com
-- "invalid repetition count(s)". O limite de 512 caracteres passa para char_length.
alter table public.message_templates drop constraint if exists message_templates_name_check;
alter table public.message_templates add constraint message_templates_name_check
  check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512);
