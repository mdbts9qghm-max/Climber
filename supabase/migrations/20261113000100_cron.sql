-- Automatik (Phase 6): täglicher WHOOP-Abruf und Versand der Erinnerungen per pg_cron + pg_net.
-- VOR dem Ausführen im SQL Editor die zwei Werte in Vault speichern (siehe docs/AUTOMATIK.md):
--   select vault.create_secret('https://<REF>.supabase.co', 'project_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.call_edge_function(fn text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  perform net.http_post(
    url := base || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function public.call_edge_function(text) from public, anon, authenticated;

-- WHOOP-Abruf als Sicherheitsnetz zu den Webhooks: 08:20 und 14:40 UTC
-- (≈ nach dem Aufwachen bzw. nach dem Tagschlaf nach der Nachtschicht)
select cron.unschedule(jobid) from cron.job where jobname in ('whoop-sync-morning', 'whoop-sync-afternoon', 'push-reminders');
select cron.schedule('whoop-sync-morning', '20 8 * * *', $$select public.call_edge_function('whoop-sync')$$);
select cron.schedule('whoop-sync-afternoon', '40 14 * * *', $$select public.call_edge_function('whoop-sync')$$);
-- Erinnerungen alle 5 Minuten prüfen
select cron.schedule('push-reminders', '*/5 * * * *', $$select public.call_edge_function('push-reminders')$$);
