# Supabase einrichten (Phase 4)

Die App läuft ohne Supabase komplett lokal. Mit Supabase werden deine Daten in der Cloud gesichert. Außerdem braucht die WHOOP-Anbindung (Phase 5) Supabase.

## 1. Projekt anlegen
1. <https://supabase.com/dashboard> → **New project**
2. Name: `ehrwald-trainer`, Region: **Central EU (Frankfurt)**, sicheres DB-Passwort (im Passwortmanager speichern).

## 2. Schema anlegen
1. Links **SQL Editor** → **New query**
2. Den kompletten Inhalt von `supabase/migrations/20261113000000_init.sql` einfügen → **Run**.
   Erwartet: „Success. No rows returned“ (Hinweise „policy … does not exist, skipping“ sind normal).
3. Kontrolle: **Table Editor** zeigt u. a. `profiles`, `session_logs`, `whoop_connections`. Bei jeder Tabelle steht „RLS enabled“.

## 3. Anmeldung ohne Passwort aktivieren
Die App meldet sich beim ersten Start **automatisch und unsichtbar** an (anonyme Anmeldung). Du brauchst weder Passwort noch E-Mail.
1. **Authentication → Sign In / Providers**: **„Allow anonymous sign-ins“ einschalten** → Save.
2. „Allow new users to sign up“ muss **an** bleiben, sonst funktioniert die anonyme Anmeldung nicht.
3. **Authentication → URL Configuration → Site URL**: deine Vercel-URL (bis dahin `http://localhost:5173`).

## 4. Schlüssel ins Frontend
**Project Settings → API**:
- `Project URL` → `VITE_SUPABASE_URL`
- `anon public` Key → `VITE_SUPABASE_ANON_KEY` (öffentlich, durch RLS geschützt)

Lokal: `.env.example` nach `.env.local` kopieren und ausfüllen (`.env*` ist in `.gitignore`).
Vercel: dieselben zwei Variablen unter *Project → Settings → Environment Variables* (Phase 7).

**Niemals** den `service_role`-Key ins Frontend oder ins Repo – der gehört nur in die Edge Functions (Phase 5, wird dort automatisch bereitgestellt).

## 5. Verbinden und Daten umziehen
1. App öffnen. Auf dem iPhone **die installierte App vom Home-Bildschirm** verwenden, nicht Safari: Safari und die installierte App haben getrennte Speicher.
2. Die App verbindet sich automatisch und lädt deine lokalen Daten hoch. Unter **Mehr → Einstellungen → Synchronisation** steht dann „synchronisiert“.
3. Kontrolle: Im **Table Editor → profiles** steht eine Zeile. Unter **Authentication → Users** siehst du einen Nutzer „Anonymous“.

## 6. Gut zu wissen
- **Deine Daten sind trotzdem privat.** Row Level Security sorgt dafür, dass jede Zeile nur ihrem Besitzer gehört. Wer zufällig die URL öffnet, bekommt eine eigene, leere App und sieht nichts von dir.
- **Die Anmeldung hängt am Gerät bzw. an der installierten App.** Löschst du die App vom Home-Bildschirm oder die Website-Daten, ist die Verbindung weg. Die Daten liegen zwar noch in Supabase, aber die neue App bekommt einen neuen leeren Zugang. Deshalb: **ab und zu unter Einstellungen → Export & Backup ein JSON-Backup speichern** (z. B. in iCloud Drive). Ein Import stellt alles wieder her. WHOOP musst du danach einmal neu verbinden.
- Nutzer „Anonymous“ ohne Daten (z. B. vom Testen in Safari) kannst du unter **Authentication → Users** löschen.

## Was wo liegt
| Tabelle | Inhalt | Zugriff Frontend |
|---|---|---|
| profiles | Einstellungen, Onboarding, Checkliste | lesen/schreiben (nur eigene) |
| day_overrides | V-Schicht, Urlaub, Tausch … | lesen/schreiben |
| session_logs | Tracking | lesen/schreiben |
| strength_tests, strength_progress | Krafttests, Stufen | lesen/schreiben |
| manual_recovery | manuelle Erholung | lesen/schreiben |
| adjustment_decisions | Protokoll abgelehnter Anpassungen | lesen/schreiben |
| whoop_* | WHOOP-Rohdaten | nur lesen |
| whoop_connections, oauth_states | Tokens | **kein Zugriff** (nur Edge Functions) |
| push_subscriptions, reminders | Web Push (Phase 6) | lesen/schreiben |
