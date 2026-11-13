# Ehrwald Trainer 🏔️🌙

Trainings-PWA für den **Ehrwald Trail 2027** (Zugspitz Ultra Trail by UTMB, 86 km / 4.295 hm,
Start Fr 18.06.2027 23:00, 22 h Zeitlimit). Lauftraining und Calisthenics in einem Plan, der sich an
den 5-Tage-Schichtrhythmus, an Schlaf und an die WHOOP-Erholung anpasst.

> Der Plan ist eine automatische Empfehlung und ersetzt keine Beratung durch Trainer oder Arzt.
> Bei Schmerzen, Krankheit oder anhaltend schlechten Erholungswerten hat Pause Vorrang.

## Was die App macht
- **Plan in Schichtzyklen**: Mikrozyklus = 5 Tage (T, N, S, F, F/V), Mesozyklus = 35 Tage. Planstart 13.11.2026, M1–M6 ab 16.11.2026, Taper ab 04.06.2027. Anzeige zusätzlich in Kalenderwochen.
- **Harte Schichtregeln**: kein Training an Tag-/V-Schichten, Tag 2 nur im Fenster 08:00–13:30 (vor dem Nap), Tag 3 nur locker. Lange Läufe und Back-to-backs liegen an Tag 4/5, Nachtläufe in der Nacht von Tag 4 auf Tag 5.
- **V-Schicht, Urlaub, Tausch, Krank** per Tipp eintragen: Der Plan verschiebt Schlüsseleinheiten höchstens einmal oder streicht sie. Nichts wird nachgeholt oder in andere Tage gequetscht.
- **Erholung als Faktor jeder Einheit**: Ampel (Grün/Gelb/Rot), Readiness aus Recovery, HRV, Ruhepuls, Schlaf, Last und Schichtkontext. Bei Gelb werden nur harte Einheiten gekürzt. Die **Vorausschau** schützt Schlüsseleinheiten in 1–2 Tagen. Jede Anpassung zeigt Original, Anpassung und den Grund in einem Satz und lässt sich ablehnen.
- **Schlafempfehlungen** für jeden Tag: Aufstehen vor der Tagschicht, Nap vor der Nachtschicht, Tagschlaf nach der Nacht, Schlafplan für den Rennstart um 23:00, optionale Push-Erinnerungen.
- **Calisthenics-Progressionen** (Muscle-Up, Front Lever, Back Lever, Dips, Core): Aufstieg nur bei erfüllten Kriterien, Krafttest alle 35 Tage.
- **WHOOP-Integration** (API v2): OAuth, Webhooks, Zuordnung über WHOOP-Zyklen (Tagschlaf nach der Nachtschicht zählt zum Schlaftag), Workouts werden automatisch als Ist-Werte übernommen.
- **Rennwoche**: Schichtkonflikt, Checkliste. Export als **.ics-Kalender** und **JSON-Backup**.

## Schnellstart (lokal)
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 88 Vitest-Tests der Kernlogik
npm run build        # Typecheck + Produktions-Build
npm run e2e          # Playwright im iPhone-Format inkl. Offline-Check → ./screenshots
```
Ohne weitere Einrichtung läuft die App **komplett lokal** (Daten im Browser). Unter *Einstellungen → Daten*
lässt sich ein **Demo-Modus** mit Beispiel-Erholungsdaten einschalten. Zum Testen eines anderen Tages hängst du
`?date=2027-04-28` an die URL.

## Livegang in 4 Schritten
| Schritt | Anleitung |
|---|---|
| 1. Supabase (Datenbank, Login, Sync) | [`docs/SUPABASE.md`](docs/SUPABASE.md) |
| 2. WHOOP (OAuth, Webhooks) | [`docs/WHOOP.md`](docs/WHOOP.md) |
| 3. Automatik (Zeitpläne, Push) | [`docs/AUTOMATIK.md`](docs/AUTOMATIK.md) |
| 4. Vercel (Hosting) | unten |

### Vercel
1. <https://vercel.com/new> → GitHub-Repo `Climber` importieren (Framework wird als Vite erkannt, `vercel.json` liegt bei).
2. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (optional, für Erinnerungen)
3. **Deploy**. Die Produktions-URL dann eintragen:
   - Supabase → Authentication → URL Configuration (Site URL + Redirect URL)
   - Supabase-Secret `APP_URL` (`supabase secrets set APP_URL=https://…`), damit WHOOP nach dem Login zurück in die App leitet.
4. Auf dem iPhone in Safari öffnen → **Teilen → Zum Home-Bildschirm**. Die Heute-Ansicht ist danach auch offline lesbar.

**Secrets gehören nie ins Frontend oder Repo**: WHOOP Client Secret, Service-Role-Key, VAPID Private Key und
`CRON_SECRET` liegen nur in den Supabase-Edge-Function-Secrets. `.env*` ist in `.gitignore`.

## Architektur
```
src/core/     reine TypeScript-Logik (Schichten, Planer, Erholung, Schlaf, Kraft, WHOOP-Zuordnung) + Tests
src/data/     local-first Store, Supabase-Sync, WHOOP-Client, Push
src/ui/       React-Seiten (Tailwind, Recharts)
src/sw/       Service Worker (Offline-Cache, Web Push)
supabase/     SQL-Migrationen (RLS) und Edge Functions (Deno)
e2e/          Playwright-Check im iPhone-Format
```
Alle Schwellenwerte und Gewichtungen stehen kommentiert in [`src/core/config.ts`](src/core/config.ts),
inklusive Begründung der Spitzenwerte (70 km/Woche, längster flacher Lauf ≈ 30 km + Back-to-back,
Bergtag 7–8 h). Details zu Algorithmen und Datenmodell: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
Entscheidungen und Fortschritt: [`CLAUDE.md`](CLAUDE.md).

## Tests
- `npm test`: Zyklustag inkl. Jahreswechsel, Sommerzeit und Renntag (Tag 5), harte Schichtregeln, V-Schicht kurzfristig, Ampel für jeden Einheitentyp, Gelb nur für harte Einheiten, Vorausschau, Schlafzuordnung über WHOOP-Zyklen, Mikrozyklus-Reduktion, kein Nachholen von Umfang, Kraftkriterien, kein schweres Beintraining vor langen Läufen, Taper/Rennwoche/Urlaubswarnung, fehlende WHOOP-Daten, Schlafempfehlungen, ICS.
- `npx deno test --allow-env supabase/functions/_shared/whoop_test.ts`: Webhook-Signatur, Pagination, Rate-Limit.
- `npm run e2e`: alle Ansichten im iPhone-13-Format, keine Konsolenfehler, kein horizontales Scrollen, offline lesbar.
