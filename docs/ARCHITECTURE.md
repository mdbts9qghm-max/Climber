# Architektur – Ehrwald Trainer

Dieses Dokument ist das Ergebnis von Phase 1 (Planung). Es beschreibt Architektur,
Datenmodell, Ordnerstruktur und Algorithmen. Die verbindlichen Entscheidungen aus der
Fragerunde stehen zusätzlich kompakt in `CLAUDE.md`.

## 1. Überblick

```
┌──────────────────────────── Browser / PWA (iPhone) ───────────────────────────┐
│  React-UI (src/ui)  ──►  App-Store (src/data/store.tsx)                         │
│        │                     │            │                                     │
│        ▼                     ▼            ▼                                     │
│  Kernlogik (src/core)   LocalRepo     SupabaseRepo ──► Supabase (Postgres+RLS)  │
│  reine TS-Module,       (localStorage, (Sync, wenn eingeloggt)                  │
│  keine UI-Abhängigkeit   offline)                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         ▲
                     Edge Functions ─────┘  whoop-auth, whoop-callback, whoop-sync,
                     (Deno, Secrets)        whoop-webhook, push-reminders
                                         ▲
                                   WHOOP API v2
```

* **Kernlogik** (`src/core`) ist komplett UI- und Netzwerk-unabhängig. Sie bekommt
  Einstellungen, Overrides, Logs und Erholungsdaten als Parameter und liefert den Plan,
  die angepassten Einheiten und die Schlafempfehlungen. Alles ist mit Vitest getestet.
* **Datenhaltung** ist local-first: Der komplette App-Zustand liegt im `localStorage`, damit
  die Heute-Ansicht offline funktioniert. Wer eingeloggt ist, synchronisiert diesen Zustand
  mit Supabase (normalisierte Tabellen, RLS auf `auth.uid()`).
* **WHOOP** läuft ausschließlich serverseitig (Edge Functions). Das Frontend sieht nie
  das Client Secret oder Tokens. Die Edge Functions speichern die WHOOP-Rohdaten, die
  Zuordnung zu Trainingstagen passiert in der Kernlogik (`whoop.ts`).

## 2. Ordnerstruktur

```
src/
  core/                 reine Logik, vollständig getestet
    config.ts           ALLE Schwellenwerte, Gewichtungen, Zeiten (kommentiert)
    types.ts            gemeinsame Typen
    dates.ts            Datumsrechnung (DST-sicher), Europe/Berlin
    shifts.ts           Zyklustag, Overrides, Tagesart, Trainingsfenster
    skeleton.ts         Mikro-/Mesozyklen, Phasen, Umfangs- und Höhenmeterziele
    sessions.ts         Bausteine für Einheiten (Laufen, Kraft, Mobility, Test)
    strength.ts         Calisthenics-Progressionen, Kriterien, Krafttest-Auswertung
    planner.ts          Planerstellung, Verschieben/Streichen, Regelprüfung
    recovery.ts         Readiness, Ampel, Einheiten-Faktor, Anpassungsregeln, Vorausschau
    sleep.ts            Schlafempfehlungen, Umsetzungs-Score, Tipps
    whoop.ts            Zuordnung WHOOP-Zyklen → Trainingstag, Workout-Matching
    analytics.ts        gelernte Muster (Recovery nach Nachtschicht/langem Lauf/Kraft)
    weeks.ts            Umrechnung auf Kalenderwochen
    race.ts             Rennwoche, Urlaubskonflikt, Checkliste
    ics.ts              .ics-Export und -Import
    sampleData.ts       Beispieldaten (statt WHOOP) für Tests und Demo
  data/                 Repositories, Store, Supabase-Client, Sync
  ui/                   React-Seiten und Komponenten
supabase/
  migrations/           SQL-Schema inkl. RLS
  functions/            Edge Functions (Deno)
e2e/                    Playwright-Skript (Screenshots im iPhone-Format)
```

## 3. Datenmodell

### Kernlogik (TypeScript, `types.ts`)

| Typ | Inhalt |
|---|---|
| `Settings` | Profil (Startumfang, Paces, Max-HR), Schichtmodell (Anker, Planstart, Renntag, Arbeitsweg, Nap), Gewichtung, Benachrichtigungen |
| `DayOverride` | Datum + Art: `V`, `URLAUB`, `KRANK`, `TAUSCH` (mit Ziel-Schicht), `UEBERSTUNDEN` (Ende), `FORTBILDUNG` (Zeiten), `FREI` |
| `ResolvedDay` | Datum, Zyklustag, effektive Tagesart, Arbeitszeit, Trainingsfenster, Verfügbarkeit |
| `Session` | stabile ID, Typ, Titel, Ziel, Dauer, km, Hm, Intensität, Ablauf, Übungen, Empfindlichkeit, Schlüsseleinheit ja/nein, `movedFrom` |
| `Plan` | Tage (`PlanDay` mit Einheiten und gestrichenen Einheiten), Mikro- und Mesozyklen, Phasen |
| `RecoveryDay` | Erholungswerte für einen Trainingstag (WHOOP oder manuell) |
| `AdjustedSession` | Original, Anpassung, Faktor, Grund in einem Satz |
| `SessionLog` | Status (erledigt/teilweise/ausgelassen), Ist-Werte, Gefühl 1–5, Notizen, Verpflegung, ob die Anpassung abgelehnt wurde |
| `StrengthState` | aktuelle Stufe je Progression + Historie |
| `StrengthTest` | Datum, Klimmzüge, Dips, Hollow-Hold, Lever-Stufen mit Haltezeit |

### Supabase (Postgres)

Alle Tabellen haben `user_id uuid references auth.users` und RLS `user_id = auth.uid()`.

| Tabelle | Zweck |
|---|---|
| `profiles` | Einstellungen (jsonb), Onboarding-Status |
| `day_overrides` | V-Schichten, Urlaub, Tausch …; PK (user_id, date) |
| `session_logs` | Tracking je Einheit; PK (user_id, session_id) |
| `strength_tests` | Krafttests |
| `strength_progress` | aktuelle Stufe je Progression |
| `manual_recovery` | manuelle Eingaben, wenn WHOOP fehlt |
| `adjustment_decisions` | abgelehnte/angenommene Anpassungen (Protokoll) |
| `whoop_connections` | Tokens – **ohne** Client-Policy, nur Service-Role liest/schreibt |
| `whoop_cycles`, `whoop_recoveries`, `whoop_sleeps`, `whoop_workouts`, `whoop_body` | WHOOP-Rohdaten (Schlüsselspalten + `raw jsonb`), Client darf lesen |
| `push_subscriptions`, `reminders` | Web Push: Abo und fällige Erinnerungen |

## 4. Algorithmen

### 4.1 Schichtberechnung (`shifts.ts`)
`zyklustag = ((datum − 2026‑10‑02) mod 5) + 1`. Gerechnet wird in reinen Kalendertagen
(UTC-Mitternacht), deshalb sind Sommerzeit und Jahreswechsel kein Problem.

Danach kommen die Overrides. Die Tagesart ergibt sich aus der Nachbarschaft der Tage:
Ein Tag ist **Schlaftag**, wenn am Vortag effektiv eine Nachtschicht war und heute nicht
gearbeitet wird. So stimmen Tausch und Urlaub automatisch. Aus der Tagesart folgt das
Trainingsfenster:

| Tagesart | Fenster |
|---|---|
| Tagschicht, V-Schicht, Fortbildung | keins (nach Tagschicht optional 10 min Mobility) |
| Nachtschicht | 08:00 bis Nap-Beginn − 90 min (= 13:30) |
| Schlaftag | 15:00 bis empfohlene Schlafenszeit − 3 h |
| Frei / Urlaub | 07:30–21:00. Ist der Folgetag ebenfalls frei, ist ein Nachtlauf erlaubt. Vor einer Tagschicht endet das Fenster 3 h vor der Schlafenszeit. |
| Krank | keins |

### 4.2 Plan-Skelett (`skeleton.ts`)
* Planstart 13.11.2026 (Zyklustag 3). **Einstiegsblock** 13.–15.11.
* **M1–M6** zu je 35 Tagen ab Mo 16.11.2026 (Tag 1), M6 endet am 13.06.2027.
* **Rennmikrozyklus** 14.–18.06.2027.
* Phasen: Grundlage M1–M2 (16.11.–24.01.), Aufbau M3–M4 (25.01.–04.04.),
  Rennspezifisch M5 + M6/1–5 (05.04.–03.06.), Taper M6/6–7 + Rennmikrozyklus (04.06.–18.06.).
* Entlastung: jeweils der 7. Mikrozyklus von M1–M5 mit −35 % Umfang.
* Umfang als Wochen-Äquivalent: Start 20 km, je Mikrozyklus ×1,07 (≈ +10 %/Woche),
  Obergrenzen je Phase 40 / 55 / 65 km. Mikrozyklus-km = Wochen-km × 5/7.
* Höhenmeter pro km: Grundlage 15, Aufbau 30, Spezifisch 45 (das Rennen hat 50 m/km).
* Langer Lauf: Grundlage 8→18 km, Aufbau 18→32 km, Spezifisch 30→48 km,
  Generalprobe am Bergwochenende 6–8 h.

### 4.3 Planerstellung (`planner.ts`)
1. Für jeden Mikrozyklus wird die Phasenvorlage auf die **Standardpositionen**
   (Tag 2/3/4/5) gelegt.
2. Danach wird die Verfügbarkeit angewendet. Einheiten auf Tagen ohne passendes Fenster:
   * Schlüsseleinheiten werden **einmal** auf den nächsten freien Tag (≤ 5 Tage) verschoben,
     der keine gleich- oder höherwertige Schlüsseleinheit hat. Dort ersetzen sie die
     Nicht-Schlüssel-Laufeinheit. Back-to-back ohne langen Lauf davor wird gestrichen.
   * Alle anderen Einheiten werden gestrichen, mit Grund. Es wird nichts in andere Tage gequetscht.
3. Verpasste Schlüsseleinheiten aus Logs werden genauso **einmal** verschoben, sonst gestrichen.
4. Bei schlechter Erholung wird der Umfang ganzer Mikrozyklen reduziert (`microFactors`).
5. Zum Schluss prüft `validatePlan`: keine Einheit an Tag 1/V, kein schweres Beintraining
   am Vortag eines langen Laufs, einer Qualitätseinheit oder des Rennens, Fenster eingehalten.

### 4.4 Erholung (`recovery.ts`)
* **Readiness 0–100**: gewichtete Summe aus Recovery, HRV-Abweichung (7/30 Tage), Ruhepuls,
  Schlaf (Dauer, Performance, Effizienz, Defizit), Last (Strain Vortag, 7-Tage-Last)
  und Schichtkontext. Die Gewichte stehen in `config.ts`.
* **Ampel**: aus dem WHOOP-Recovery-Score (67/34). Ohne WHOOP aus der Readiness der
  manuellen Eingabe.
* **Regeln** in dieser Reihenfolge: Krank → Rot → Schlaf < 5 h → Schlaftag-Regel → Gelb
  (nur harte Einheiten: eine Stufe runter, −10 bis −25 % je nach Readiness) → Vorausschau.
* **Vorausschau**: Stehen in 1–2 Tagen Schlüsseleinheiten an und gibt es einen Auslöser
  (gelb, HRV fällt seit 2–3 Tagen, Schlafdefizit wächst, gelernter Abfall), werden
  **nur harte Einheiten** reduziert oder umgewandelt. Die Stärke hängt von der Wichtigkeit
  und der Nähe der kommenden Einheit ab. Eine Nachtschicht dazwischen verstärkt die
  Reduktion, löst sie aber nie allein aus (Grund: Spec 6.3 „Tag 2 grün = wie geplant“).
* Es wird nie etwas härter gemacht. Bei Recovery ≥ 80 kommt höchstens ein Vorschlag,
  eine gestrichene Schlüsseleinheit nachzuholen.
* Ganze Mikrozyklen werden reduziert bei ≥ 3 gelb/roten Tagen in Folge (−15 %),
  ≥ 2 roten Tagen in Folge (−25 %) oder einem Schlafdefizit, das 3 Tage lang wächst (−10 %).
* Warnsignal: Ruhepuls ≥ +5 an 3 von 4 Tagen und HRV ≤ −20 % an ≥ 2 Tagen.

### 4.5 Schlaf (`sleep.ts`)
Pro Datum: optionaler Tagschlaf (nach der Nachtschicht), optionaler Nap (vor der
Nachtschicht) und die Nacht (Abend → nächster Morgen).
Aufstehen vor der Arbeit = Arbeitsbeginn − 15 min Weg − 30 min Morgenroutine.
Schlafenszeit = Aufstehen − Schlafbedarf − 15 min Einschlafzeit. Vor Schlüsseleinheiten
und bei Schlafdefizit wird früher geschlafen, ein Nachtlauf verschiebt die Nacht.
In den letzten 14 Tagen vor dem Rennen gibt es einen Rennschlafplan (Nap am Renntag).

### 4.6 WHOOP-Zuordnung (`whoop.ts`)
Ein Trainingstag bekommt die Recovery des **WHOOP-Zyklus, der zum Trainingsbeginn läuft**
(`cycle.start ≤ Fensterbeginn < cycle.end`). Nach der Nachtschicht beginnt der Zyklus mit
dem Tagschlaf um 08:00, deshalb gehört diese Recovery zum Schlaftag. Naps erzeugen keinen
Zyklus. WHOOP-Workouts werden über Datum, Zeitfenster und Sportart der geplanten Einheit
mit der besten Überdeckung zugeordnet und sind manuell korrigierbar.

## 5. Phasenplan (Spec 12)
1. Planung ✔ · 2. Kernlogik · 3. Oberfläche · 4. Supabase · 5. WHOOP · 6. Automatik · 7. Livegang
