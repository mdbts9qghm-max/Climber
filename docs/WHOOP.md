# WHOOP anbinden (Phase 5)

Voraussetzung: Supabase ist eingerichtet (`docs/SUPABASE.md`) und du bist in der App angemeldet.
Platzhalter `<REF>` = deine Supabase-Projekt-Referenz (steht in der Project URL `https://<REF>.supabase.co`).

## 1. App im WHOOP Developer Dashboard
<https://developer-dashboard.whoop.com> → **Create App** bzw. deine App öffnen:

| Feld | Wert |
|---|---|
| Name | Ehrwald Trainer |
| **Redirect URL** | `https://<REF>.supabase.co/functions/v1/whoop-callback` |
| **Scopes** | `offline` `read:profile` `read:recovery` `read:sleep` `read:cycles` `read:workout` `read:body_measurement` |
| **Webhook URL** | `https://<REF>.supabase.co/functions/v1/whoop-webhook` |
| Webhook-Modellversion | **v2** |

Danach **Client ID** und **Client Secret** kopieren. Das Secret kommt nur in die Supabase-Secrets – niemals ins Frontend, in Vercel oder ins Repo.

## 2. Edge Functions deployen (einmalig, vom Rechner aus)
```bash
npm i -g supabase            # oder: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <REF>

# Secrets (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit)
supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... \
  APP_URL=https://DEINE-VERCEL-URL CRON_SECRET=$(openssl rand -hex 24)

supabase functions deploy whoop-auth whoop-callback whoop-sync whoop-webhook
```
`supabase/config.toml` legt fest, dass Callback und Webhook ohne Supabase-JWT erreichbar sind
(abgesichert über den `state`-Parameter bzw. die HMAC-Signatur von WHOOP).

Bis Phase 7 (Vercel) kannst du `APP_URL=http://localhost:5173` setzen und später ändern.

## 3. Verbinden
App → **Mehr → Einstellungen → WHOOP → Mit WHOOP verbinden** → bei WHOOP einloggen und zustimmen.
Du landest wieder in den Einstellungen mit „WHOOP verbunden“. Die letzten 60 Tage werden sofort geladen
(Baselines für HRV und Ruhepuls).

## So funktioniert es
| Function | Aufgabe |
|---|---|
| `whoop-auth` | erzeugt einen einmaligen `state`, liefert die WHOOP-Login-URL |
| `whoop-callback` | tauscht den Code gegen Tokens, speichert sie in `whoop_connections` (für das Frontend unsichtbar), erster Abruf |
| `whoop-sync` | Abruf mit automatischem Token-Refresh. Beim Öffnen der App (höchstens alle 15 min), per Knopf „Jetzt abrufen“ und täglich per Zeitplan (Phase 6) |
| `whoop-webhook` | prüft die Signatur (`X-WHOOP-Signature`, HMAC-SHA256 über Timestamp + Body, max. 5 min alt) und lädt bei `recovery.updated`, `sleep.updated`, `workout.updated` sofort nach. `*.deleted` entfernt die Daten |

- **API-Limits** (100 Anfragen/min, 10.000/Tag): Abruf seitenweise (25 Einträge), bei HTTP 429 wird `Retry-After` abgewartet. Inkrementell werden nur die letzten Tage mit 3 Tagen Überlappung geholt.
- **Caching**: Rohdaten liegen in `whoop_*`-Tabellen und zusätzlich im Browser (offline lesbar).
- **Zuordnung**: Recovery und Schlaf werden über WHOOP-Zyklen dem Trainingstag zugeordnet, nicht über Kalendertage (`src/core/whoop.ts`, getestet in `whoop.test.ts`).
- **Workouts** werden automatisch der passenden geplanten Einheit zugeordnet (Datum, Sportart, Startzeit) und als Ist-Werte übernommen. Korrektur: Einheit öffnen → Tracking → WHOOP-Workout.
- **Max. Herzfrequenz** kommt aus `body_measurement` und bestimmt die Pulszonen.

## Fehlersuche
- Supabase → **Edge Functions → Logs** zeigt Fehler von Callback, Sync und Webhook.
- „Ungültiger oder abgelaufener state“: Verbinden erneut starten (der Link ist 1 h gültig).
- Webhook 401: Webhook-URL/Secret prüfen. WHOOP signiert mit dem Client Secret.
