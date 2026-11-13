/**
 * Zentrale Konfiguration der Trainingslogik.
 *
 * ALLE Schwellenwerte, Gewichtungen und Zeiten der Kernlogik stehen hier.
 * Werte, die der Nutzer in den Einstellungen ändern kann, sind nur die Defaults
 * (siehe `defaultSettings` in settings.ts). Alles andere wird hier nachjustiert.
 */

// ───────────────────────────── Rennen & Zeitraum ─────────────────────────────

export const RACE = {
  name: 'Ehrwald Trail (Zugspitz Ultra Trail by UTMB)',
  date: '2027-06-18',
  start: '23:00',
  /** Zielschluss Samstag 21:00 = 22 h Zeitlimit */
  cutoffDate: '2027-06-19',
  cutoff: '21:00',
  distanceKm: 86,
  elevationM: 4295,
} as const

export const PLAN = {
  /** Ankerdatum: Freitag 02.10.2026 = Zyklustag 1 (Tagschicht) */
  anchorDate: '2026-10-02',
  /** Planstart laut Fragerunde (Tag 3 = Schlaftag) */
  startDate: '2026-11-13',
  /** Erster Tag 1 nach Planstart: hier beginnt M1 */
  firstMesoStart: '2026-11-16',
  microLength: 5,
  microsPerMeso: 7,
  mesoCount: 6,
} as const

export const TIMEZONE = 'Europe/Berlin'

// ───────────────────────────── Schichtmodell ─────────────────────────────

export const SHIFTS = {
  /** Dienstzeiten laut SPEC 4.1; Arbeitsbeginn tatsächlich 15 min vorher */
  T: { start: '07:00', end: '19:00' },
  N: { start: '19:00', end: '07:00' },
  V: { start: '08:00', end: '20:00' },
  /** Default für Fortbildung, wenn keine Zeiten eingetragen sind */
  FORTBILDUNG: { start: '08:00', end: '16:00' },
  earlyStartMin: 15,
} as const

export const SLEEP_DEFAULTS = {
  /** Morgenroutine zwischen Aufstehen und Abfahrt */
  morningRoutineMin: 30,
  /** Einschlafzeit, die zur Schlafenszeit addiert wird */
  sleepLatencyMin: 15,
  /** Schlaf nach der Nachtschicht (SPEC 4.2) */
  postNightSleep: { start: '08:00', end: '14:00' },
  /** Nap vor der Nachtschicht */
  napStart: '15:00',
  napMinMin: 90,
  /** Bei größerem Schlafdefizit: zwei Schlafzyklen */
  napLongMin: 150,
  napLongIfDebtH: 2,
  /** Zwischen Nap-Ende und Abfahrt */
  napWakeBeforeDepartureMin: 30,
  /** Standard-Schlafbedarf, wenn WHOOP keinen liefert */
  defaultNeedH: 8,
  /** Normaler Rhythmus an freien Tagen */
  normalBed: '22:30',
  normalWake: '07:00',
  /** Frühestens so früh ins Bett (realistisch) */
  earliestBed: '21:00',
  /** Spätestens so spät (normaler Rhythmus) */
  latestNormalBed: '23:30',
  /** Vor Schlüsseleinheiten früher ins Bett */
  beforeKeyEarlierMin: 30,
  /** Schlafdefizit: pro Stunde Defizit so viele Minuten früher, gedeckelt */
  debtEarlierMinPerH: 15,
  debtEarlierMaxMin: 45,
  /** Nach Nachtlauf: Schlaf beginnt so viel nach Laufende */
  afterNightRunMin: 60,
  /** Training endet am Schlaftag spätestens so viele Stunden vor der Schlafenszeit */
  trainingEndBeforeBedH: 3,
  /** Rennvorbereitung: so viele Tage vor dem Rennen gilt der Rennschlafplan */
  raceSleepPlanDays: 14,
  raceDayNap: { start: '14:00', end: '16:30' },
} as const

// ───────────────────────────── Trainingsfenster ─────────────────────────────

export const WINDOWS = {
  /** Tag 2: ab 08:00, Ende = Nap-Beginn minus Essens-Puffer */
  nightShiftStart: '08:00',
  mealBufferBeforeNapMin: 90,
  /** Tag 3: ab 15:00 */
  sleepDayStart: '15:00',
  /** Freie Tage */
  freeStart: '07:30',
  freeEnd: '21:00',
  /** Nachtlauf darf bis hierhin gehen (nächster Tag frei) */
  nightRunEnd: '02:00',
  /** Mindestlänge eines Fensters in Minuten, sonst Tag ohne Training */
  minWindowMin: 30,
  /** Optionale Mobility nach Tagschicht */
  dayShiftMobilityMin: 10,
} as const

// ───────────────────────────── Phasen & Umfang ─────────────────────────────

/**
 * Begründung der Spitzenwerte (SPEC 5.3):
 *
 * - Spitzen-Wochenumfang 70 km (= 50 km pro 5-Tage-Mikrozyklus): Für ein erstes Finish
 *   über 86 km / 4.300 hm mit 22 h Zeitlimit reichen 60–75 km/Woche, wenn der Fokus auf
 *   Zeit auf den Beinen und Höhenmetern liegt. Mehr Umfang erhöht bei einem Schichtarbeiter
 *   mit nur 3 vollwertigen Trainingstagen pro 5 Tagen vor allem das Verletzungs- und
 *   Erschöpfungsrisiko. Start bei 20 km/Woche: +7 % pro Mikrozyklus (≈ +10 %/Woche)
 *   erreicht die Spitze nach ca. 20 Mikrozyklen inkl. Entlastungen – das passt in die
 *   verfügbaren 43 Mikrozyklen, ohne die 10-%-Regel zu verletzen.
 * - Weil nur 3 Tage pro Mikrozyklus vollwertig sind, trägt der lange Lauf einen großen
 *   Anteil (60–70 %). Daraus folgt: längster flacher Lauf ≈ 30–35 km, Back-to-backs
 *   z. B. 30 + 15 km (simulieren die zweite Rennhälfte auf müden Beinen), Nachtläufe
 *   bis 25 km (ca. 3,5 h mit Stirnlampe).
 * - Generalprobe am Bergwochenende: 7–8 h mit 2.000+ hm statt 50–60 km flach. Zeit auf
 *   den Beinen und echte Bergab-Belastung sind für das Finish wichtiger als Kilometer.
 * - Spitzen-Höhenmeter ≈ 3.000 hm/Woche (70 km × 45 m/km): Das Rennen hat 50 m/km.
 *   Im Flachland kommen die Höhenmeter vom Laufband (10–15 %), Treppen und den drei
 *   Bergwochenenden. Exzentrische Beinkraft ersetzt einen Teil der fehlenden Bergab-km.
 */
export const VOLUME = {
  /** Wachstum pro Mikrozyklus: 1,10^(5/7) ≈ 1,07 → ca. 10 % pro Woche */
  growthPerMicro: 1.07,
  /** Obergrenzen des Wochen-Äquivalents je Phase (km) */
  weeklyCap: { intro: 40, base: 40, build: 60, specific: 70, taper: 70, race: 70 },
  peakWeeklyKm: 70,
  /** Entlastungs-Mikrozyklus: Faktor auf den Umfang (−35 %) */
  deloadFactor: 0.65,
  /** Bergwochenende: dieser Mikrozyklus darf größer sein (seltene geplante Spitze) */
  mountainFactor: 1.2,
  /** Taper: Faktoren bezogen auf den Spitzenumfang (vorletzter, letzter Mikrozyklus von M6) */
  taperFactors: [0.7, 0.5],
  raceMicroFactor: 0.2,
  /** Höhenmeter pro Laufkilometer je Phase */
  hmPerKm: { intro: 10, base: 15, build: 30, specific: 45, taper: 30, race: 10 },
  /** Langer Lauf: Grenzen je Phase (km) */
  longRun: {
    intro: [6, 10],
    base: [8, 18],
    build: [16, 34],
    specific: [24, 36],
    taper: [10, 24],
    race: [0, 0],
  },
  /** Anteil des langen Laufs am Mikrozyklus */
  longShare: { intro: 0.45, base: 0.55, build: 0.7, specific: 0.7, taper: 0.55, race: 0 },
  /** Mikrozyklus mit Back-to-back: langer Lauf + B2B */
  b2bShares: { long: 0.6, b2b: 0.3 },
  /** Bergwochenende */
  mountainShares: { day1: 0.55, day2: 0.3 },
  /** Verteilung des Rests auf Tag 2 / Tag 5 / Tag 3 (optional) */
  restShares: { tag2: 0.45, tag5: 0.35, regen: 0.2 },
  minEasyKm: 4,
  maxEasyKm: 14,
  /** Paces für Dauerberechnung (min/km), Flach, locker */
  easyPace: 7.0,
  longPace: 7.5,
  /** Zuschlag Minuten pro 100 hm (bergauf gehen/laufen) */
  minPer100Hm: 10,
  /** Laufband-Höhenmeter-Einheit: Anteil der Strecke mit Steigung */
  treadmillInclineShare: 0.7,
  /** Langer Lauf im Flachland: max. hm pro km (Brücken, Deiche, Treppen) */
  flatLongHmPerKm: 12,
  /** Ab dieser Dauer (min) Verpflegungstraining */
  fuelingFromMin: 90,
  carbsPerHour: { build: '40–60 g', specific: '60–90 g', taper: '60–90 g' },
  /** Langer Lauf wächst höchstens so stark pro Mikrozyklus (≈ 10 %/Woche) */
  longGrowthPerMicro: 1.08,
  /** Bergwochenende Tag 1 (Generalprobe) Dauer in Stunden */
  mountainDayHours: [6, 8],
} as const

/** Steigung für Laufband-Höhenmeter-Einheiten je Phase */
export const TREADMILL = {
  inclinePct: { intro: 8, base: 10, build: 12, specific: 15, taper: 12, race: 8 },
} as const

/** Bergwochenenden: [Mesozyklus (1-basiert), Mikrozyklus (1-basiert)] */
export const MOUNTAIN_WEEKENDS: ReadonlyArray<readonly [number, number]> = [
  [4, 5],
  [5, 3],
  [6, 2],
]
export const MOUNTAIN_NOTICE_DAYS = 21

/** Nachtläufe: ab Mesozyklus 4 in jedem 2. Mikrozyklus (Spezifisch), in M4 einmal */
export const NIGHT_RUNS = {
  fromMeso: 4,
  buildOnlyMicro: 3,
  specificEveryNth: 2,
  start: '21:00',
  /** Nachtlauf höchstens so lang (ca. 3–3,5 h im Dunkeln) */
  maxKm: 25,
} as const

// ───────────────────────────── Kraft ─────────────────────────────

export const STRENGTH = {
  /** Wie oft müssen die Kriterien einer Stufe erfüllt sein, bevor aufgestiegen wird */
  sessionsMeetingCriteria: 2,
  /** Muscle-Up-Training erst ab ... (SPEC 5.5) */
  muscleUpPrereq: { pullUps: 10, dips: 10 },
  restSec: { skill: 120, strength: 150, accessory: 75 },
} as const

// ───────────────────────────── Erholung ─────────────────────────────

/** WHOOP-Ampel (SPEC 6.1) */
export const RECOVERY_ZONES = { green: 67, yellow: 34 } as const

/**
 * Gewichtung der Readiness (Summe = 1). Jede Komponente ist auf 0–100 normiert.
 * Readiness bestimmt die Stärke der Reduktion bei Gelb und den angezeigten Einheiten-Faktor.
 */
export const RECOVERY_WEIGHTS = {
  recovery: 0.4,
  hrv: 0.15,
  rhr: 0.1,
  sleep: 0.2,
  load: 0.07,
  shift: 0.08,
} as const
export type RecoveryWeights = { -readonly [K in keyof typeof RECOVERY_WEIGHTS]: number }

export const RECOVERY = {
  /** Schlaf unter diesem Wert: keine Intensität, kein schweres Krafttraining */
  minSleepH: 5,
  /** Schlaftag: Training nur bei mindestens Gelb und so viel Tagschlaf */
  sleepDayMinSleepH: 5,
  /** Gelb: Dauer der harten Einheiten 10–25 % kürzer (je nach Readiness) */
  yellowReduction: { min: 0.1, max: 0.25 },
  /** Rot: höchstens so lange sehr locker / Mobility */
  redMaxMin: 30,
  /** HRV-Komponente: ±30 % Abweichung vom 30-Tage-Mittel = 0 bzw. 100 Punkte */
  hrvRangePct: 30,
  /** Ruhepuls-Komponente: ±8 Schläge Abweichung = 0 bzw. 100 */
  rhrRangeBpm: 8,
  /** Schlafdefizit: ab diesem Defizit 0 Punkte in der Defizit-Teilkomponente */
  maxDebtH: 3,
  /** Strain Vortag ab dem die Last-Komponente sinkt (WHOOP 0–21) */
  strainHighFrom: 12,
  /** Stunden seit Schichtende, unter denen der Schichtkontext Punkte kostet */
  hoursSinceShiftLow: 10,
  /** HRV-Trend: über so viele Tage fallend = Auslöser */
  hrvTrendDays: 3,
  /** Schlafdefizit-Trend: so viele Tage in Folge steigend = Auslöser */
  debtTrendDays: 3,
  /** Mikrozyklus-Reduktion */
  micro: {
    yellowRedStreak: 3,
    yellowRedFactor: 0.85,
    redStreak: 2,
    redFactor: 0.75,
    debtRisingDays: 3,
    debtMinH: 2,
    debtFactor: 0.9,
  },
  /** Warnsignal */
  warning: { rhrDeltaBpm: 5, rhrDays: 3, rhrWindow: 4, hrvDropPct: 20, hrvDays: 2 },
  /** Vorschlag zum Nachholen nur bei sehr guter Recovery */
  makeUpSuggestionMin: 80,
  makeUpLookbackDays: 3,
  /** Vorausschau */
  lookahead: {
    days: 2,
    proximity: { 1: 1.0, 2: 0.6 } as Record<number, number>,
    importance: { LONG_RUN: 1, B2B_RUN: 1, MOUNTAIN_DAY: 1, RACE: 1, NIGHT_RUN: 1, HILL_INTERVALS: 0.7, THRESHOLD: 0.7, STRENGTH_TEST: 0.7 } as Record<string, number>,
    nightShiftBonus: 0.2,
    /** Ab diesem Score wird umgewandelt (z. B. Schwelle → 45 min locker), darunter nur reduziert */
    convertFrom: 0.6,
    convertEasyMin: 45,
    reducePct: 0.15,
    /** gelernter Abfall: wenn erwartete Recovery am Tag der Schlüsseleinheit darunter → Auslöser */
    learnedThreshold: 50,
  },
} as const

// ───────────────────────────── Auswertungen ─────────────────────────────

export const ANALYTICS = {
  /** Gelernte Muster erst ab so vielen Tagen Daten (≈ 6 Wochen) */
  minDays: 42,
  minSamples: 3,
} as const

// ───────────────────────────── WHOOP ─────────────────────────────

export const WHOOP = {
  /** Zuordnung eines Workouts zur Einheit: maximale Abweichung vom Fenster in Stunden */
  matchToleranceH: 3,
  /** HF-Zonen in % der max. HF (WHOOP-Zonen 1–5) */
  zones: [
    { zone: 1, from: 50, to: 60 },
    { zone: 2, from: 60, to: 70 },
    { zone: 3, from: 70, to: 80 },
    { zone: 4, from: 80, to: 90 },
    { zone: 5, from: 90, to: 100 },
  ],
} as const
