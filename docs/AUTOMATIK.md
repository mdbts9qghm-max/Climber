# Automatik (Phase 6)

Wie sich der Plan automatisch anpasst:

| Auslöser | Was passiert |
|---|---|
| WHOOP-Webhook `recovery.updated` / `sleep.updated` / `workout.updated` | `whoop-webhook` lädt sofort nach, also direkt nach dem Aufwachen, auch nach dem Tagschlaf nach der Nachtschicht |
| App öffnen | `whoop-sync` (höchstens alle 15 min) als Fallback, danach wird die Heute-Ansicht neu berechnet |
| Zeitplan 08:20 und 14:40 UTC | `whoop-sync` für alle Verbindungen als Sicherheitsnetz (pg_cron) |
| Neue Erholungsdaten | Einheiten-Faktor, Anpassungen, Vorausschau, Mikrozyklus-Reduktion und Schlafempfehlung werden in der App neu berechnet (reine Kernlogik, offline-fähig) |
| Alle 5 min | `push-reminders` verschickt fällige Erinnerungen (Schlafenszeit, Nap) |

## 1. VAPID-Schlüssel für Web Push
```bash
npx web-push generate-vapid-keys
```
- **Public Key** → Vercel/`.env.local`: `VITE_VAPID_PUBLIC_KEY=...` (öffentlich)
- **Private Key** → nur Supabase-Secret:
```bash
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:deine@adresse.de
supabase functions deploy push-reminders
```

## 2. Zeitpläne anlegen (SQL Editor)
1. Zwei Werte in Vault speichern (`<REF>` und dein `CRON_SECRET` aus `docs/WHOOP.md`):
   ```sql
   select vault.create_secret('https://<REF>.supabase.co', 'project_url');
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
   ```
2. Inhalt von `supabase/migrations/20261113000100_cron.sql` ausführen.
3. Kontrolle: `select jobname, schedule from cron.job;` zeigt drei Jobs. Läufe: `select * from cron.job_run_details order by start_time desc limit 10;`

## 3. Erinnerungen auf dem iPhone
1. App in Safari öffnen → **Teilen → Zum Home-Bildschirm**.
2. App **vom Home-Bildschirm** starten (nur dort gibt es Push, iOS 16.4+).
3. Einstellungen → Konto anmelden → **Erinnerungen** einschalten → Benachrichtigungen erlauben.

Die App hinterlegt die Zeitpunkte der nächsten 3 Tage und aktualisiert sie, sobald sich Plan, Schicht oder Erholung ändern.
