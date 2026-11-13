# Supabase einrichten (Phase 4)

Die App läuft ohne Supabase komplett lokal. Mit Supabase werden deine Daten gesichert und zwischen
Geräten synchronisiert. Außerdem braucht die WHOOP-Anbindung (Phase 5) Supabase.

## 1. Projekt anlegen
1. <https://supabase.com/dashboard> → **New project**
2. Name: `ehrwald-trainer`, Region: **Central EU (Frankfurt)**, sicheres DB-Passwort (im Passwortmanager speichern).

## 2. Schema anlegen
1. Links **SQL Editor** → **New query**
2. Den kompletten Inhalt von `supabase/migrations/20261113000000_init.sql` einfügen → **Run**.
   Erwartet: „Success. No rows returned“ (Hinweise „policy … does not exist, skipping“ sind normal).
3. Kontrolle: **Table Editor** zeigt u. a. `profiles`, `session_logs`, `whoop_connections`. Bei jeder Tabelle steht „RLS enabled“.

## 3. Login per E-Mail-Code
1. **Authentication → Sign In / Providers → Email**: aktiviert lassen.
2. **Authentication → Emails → Templates → Magic Link**: im Text zusätzlich den Code einfügen, z. B.
   ```html
   <h2>Dein Anmeldecode</h2>
   <p>Code: <strong>{{ .Token }}</strong></p>
   <p>Oder <a href="{{ .ConfirmationURL }}">hier anmelden</a>.</p>
   ```
   Hintergrund: Auf dem iPhone öffnet der Link Safari, nicht die installierte App. Mit dem Code meldest du dich direkt in der App an.
3. **Authentication → URL Configuration**
   - Site URL: deine Vercel-URL (z. B. `https://ehrwald-trainer.vercel.app`; bis Phase 7: `http://localhost:5173`)
   - Redirect URLs: `http://localhost:5173/**` und `https://DEINE-VERCEL-URL/**`

## 4. Schlüssel ins Frontend
**Project Settings → API**:
- `Project URL` → `VITE_SUPABASE_URL`
- `anon public` Key → `VITE_SUPABASE_ANON_KEY` (öffentlich, durch RLS geschützt)

Lokal: `.env.example` nach `.env.local` kopieren und ausfüllen (`.env*` ist in `.gitignore`).
Vercel: dieselben zwei Variablen unter *Project → Settings → Environment Variables* (Phase 7).

**Niemals** den `service_role`-Key ins Frontend oder ins Repo – der gehört nur in die Edge Functions (Phase 5, wird dort automatisch bereitgestellt).

## 5. Anmelden und Daten umziehen
1. App öffnen → **Mehr → Einstellungen → Konto & Synchronisation** → E-Mail eingeben → **Anmeldecode senden**.
2. Code aus der Mail eingeben → **Anmelden**.
3. Beim ersten Login ist die Datenbank leer: Die App lädt deine lokalen Daten automatisch hoch (Status „synchronisiert“). Zur Sicherheit kannst du **Lokale Daten jetzt hochladen (Umzug)** drücken.
4. Kontrolle: Im **Table Editor → profiles** steht eine Zeile mit deiner `user_id`.

## 6. Nur du darfst rein
Wenn dein Konto existiert: **Authentication → Sign In / Providers → „Allow new users to sign up“ ausschalten**.
Damit kann sich niemand sonst registrieren. RLS sorgt zusätzlich dafür, dass jede Zeile nur ihrem Besitzer gehört.

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
