# CLAUDE.md – Ehrwald Trainer

Trainings-PWA für den Ehrwald Trail 2027 (86 km / 4.295 hm, Start Fr 18.06.2027 23:00, Zeitlimit 22 h).
Die vollständige Vorgabe ist die SPEC (vom Nutzer als PDF geliefert). Architektur: `docs/ARCHITECTURE.md`.

## Arbeitsregeln
- Sprache der App: Deutsch. Einheiten km, m, kg. Datum TT.MM.JJJJ. Zeitzone Europe/Berlin.
- Die gesamte Trainingslogik liegt in `src/core` als reine TypeScript-Module **ohne** React-, DOM- oder Netzwerk-Imports.
- **Alle** Schwellenwerte, Gewichtungen und Zeiten stehen in `src/core/config.ts` (kommentiert). Keine Magic Numbers in anderen Modulen.
- Secrets (WHOOP Client Secret, Tokens, Service-Role-Key, VAPID private key) nur in Edge Functions/Umgebungsvariablen. Nie ins Frontend, nie ins Repo.
- Vor jedem Commit: `npm test` und `npm run build` müssen durchlaufen.
- Nach jeder Phase: Fortschrittsliste unten aktualisieren, committen und auf `claude/charming-galileo-m19d99` pushen (vom Nutzer freigegeben).
- Keine Modell-Bezeichnungen in Commits oder Code.

## Entscheidungen aus der Fragerunde (verbindlich, ergänzen/ersetzen die SPEC)
- **Planstart 13.11.2026** (nicht 01.10.). Ankerdatum bleibt 02.10.2026 = Zyklustag 1 (13.11. = Tag 3, 16.11. = Tag 1, 18.06.2027 = Tag 5).
- **Mesozyklen rückwärts vom Renntag**: Einstiegsblock 13.–15.11.2026, M1–M6 je 35 Tage ab 16.11.2026 (M6 endet 13.06.2027), Rennmikrozyklus 14.–18.06.2027. Taper = letzte 2 Mikrozyklen von M6 + Rennmikrozyklus.
- **Phasen legt der Planer**, auf Mesozyklus-Grenzen: Grundlage M1–M2, Aufbau M3–M4, Rennspezifisch M5 + M6/1–5, Taper ab 04.06.2027.
- **Startumfang 20 km/Woche** (einstellbar), max. ca. +10 %/Woche.
- **Arbeitsweg 15 min ohne Puffer** für alle Schichten: Abfahrt T 06:30, N 18:30, V 07:30. Aufstehen vor T ≈ 06:00 (30 min Morgenroutine, einstellbar).
- **Nachtläufe** am Abend/in der Nacht von Tag 4 auf Tag 5 (Tag 5 frei zum Ausschlafen).
- **Schweres Beintraining bevorzugt an Tag 2**; an Tag 4 nur, wenn Tag 5 weder langer Lauf noch Qualität hat.
- **Urlaub 18.–20.06.2027 ist genehmigt** und vorbelegt → keine Urlaubswarnung, aber Hinweis auf Tagschicht 14.06. und Nachtschicht 15.06. im Taper.
- **Bergwochenenden** sind möglich (2–4 h Anfahrt): 3 Stück (Ende Aufbau, Mitte Spezifisch, Generalprobe), mit Vorwarnung ab 21 Tagen.
- **Pulszonen** aus dem WHOOP-Profil (max. HF aus `body_measurement`), bis dahin Intensität nach Gefühl (RPE).
- **Gerät: iPhone** → Web Push nur bei installierter PWA (iOS ≥ 16.4); Tests im iPhone-Viewport.
- Supabase-, Vercel- und WHOOP-Developer-Accounts sind vorhanden.
- Auslegung SPEC 6.3 vs. 6.3a: Eine Nachtschicht vor der Schlüsseleinheit **verstärkt** eine Vorausschau-Reduktion, löst sie aber allein nicht aus (sonst Widerspruch zu „Tag 2 grün = wie geplant“).

## Befehle
- `npm run dev` – Entwicklungsserver
- `npm test` – Vitest (Kernlogik)
- `npm run build` – Typecheck + Produktions-Build
- `npm run e2e` – Playwright-Screenshots im iPhone-Format (`e2e/screens.mjs`)

## Fortschritt
- [x] Phase 1 – Planung (Architektur, Datenmodell, Algorithmen, CLAUDE.md, Git)
- [x] Phase 2 – Kernlogik + Tests (86 Vitest-Tests, alle SPEC-11-Szenarien)
- [x] Phase 3 – Oberfläche (alle Ansichten, Playwright-Check im iPhone-Format: `npm run e2e`)
- [ ] Phase 4 – Supabase
- [ ] Phase 5 – WHOOP
- [ ] Phase 6 – Automatik
- [ ] Phase 7 – Livegang
