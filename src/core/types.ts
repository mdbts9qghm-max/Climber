/** Gemeinsame Typen der Kernlogik. */

/** Kalenderdatum `YYYY-MM-DD` (lokal, Europe/Berlin) */
export type ISODate = string
/** Uhrzeit `HH:MM` (lokal) */
export type HHMM = string

export type CycleDay = 1 | 2 | 3 | 4 | 5

// ───────────── Schichten ─────────────

export type OverrideType = 'V' | 'URLAUB' | 'KRANK' | 'TAUSCH' | 'UEBERSTUNDEN' | 'FORTBILDUNG' | 'FREI'

export interface DayOverride {
  date: ISODate
  type: OverrideType
  /** Nur bei TAUSCH: welche Schicht stattdessen gearbeitet wird ('F' = frei) */
  shift?: 'T' | 'N' | 'V' | 'F'
  /** FORTBILDUNG: Beginn/Ende; UEBERSTUNDEN: neues Dienstende */
  start?: HHMM
  end?: HHMM
  note?: string
}

export type DayKind =
  | 'DAY_SHIFT'
  | 'NIGHT_SHIFT'
  | 'SLEEP_DAY'
  | 'FREE'
  | 'V_SHIFT'
  | 'VACATION'
  | 'SICK'
  | 'CUSTOM_WORK'

export type Availability = 'full' | 'limited' | 'optional' | 'none'

export interface TimeWindow {
  start: HHMM
  end: HHMM
  /** Ende liegt am Folgetag (z. B. Nachtlauf bis 02:00) */
  endsNextDay?: boolean
}

export interface ResolvedDay {
  date: ISODate
  cycleDay: CycleDay
  kind: DayKind
  /** Dienstzeit (offiziell) */
  work: { start: HHMM; end: HHMM; endsNextDay: boolean } | null
  /** Tatsächlicher Arbeitsbeginn (15 min früher) */
  workStartActual: HHMM | null
  label: string
  short: string
  override?: DayOverride
  window: TimeWindow | null
  availability: Availability
  /** Nachtlauf möglich (Folgetag frei) */
  nightRunAllowed: boolean
}

// ───────────── Plan ─────────────

export type Phase = 'intro' | 'base' | 'build' | 'specific' | 'taper' | 'race'

export type SessionType =
  | 'LONG_RUN'
  | 'B2B_RUN'
  | 'NIGHT_RUN'
  | 'MOUNTAIN_DAY'
  | 'EASY_RUN'
  | 'RECOVERY_RUN'
  | 'HILL_INTERVALS'
  | 'THRESHOLD'
  | 'HILL_TREADMILL'
  | 'STAIRS'
  | 'SHAKEOUT'
  | 'CALI_MAIN'
  | 'CALI_SKILL'
  | 'LEGS_HEAVY'
  | 'LEGS_ECCENTRIC'
  | 'LEGS_MAINT'
  | 'MOBILITY'
  | 'STRENGTH_TEST'
  | 'RACE'

export type Sensitivity = 'high' | 'medium' | 'low'
export type Category = 'run' | 'strength' | 'mobility' | 'test' | 'race'

export interface Exercise {
  name: string
  sets: number
  reps?: number
  holdSec?: number
  restSec: number
  note?: string
  progression?: ProgressionId
  /** Versuch der nächsten Stufe (harte Komponente, entfällt bei Gelb) */
  attempt?: boolean
}

export interface Intensity {
  /** 0 = sehr locker, 1 = locker, 2 = mittel/Schwelle, 3 = hart */
  level: 0 | 1 | 2 | 3
  rpe: string
  zone?: string
}

export interface Session {
  /** Stabile ID: `${ursprüngliches Datum}:${slot}` */
  id: string
  date: ISODate
  type: SessionType
  category: Category
  title: string
  goal: string
  sensitivity: Sensitivity
  key: boolean
  durationMin: number
  distanceKm?: number
  elevationM?: number
  treadmill?: { inclinePct: number; km: number }
  intensity: Intensity
  structure: { warmup: string[]; main: string[]; cooldown: string[] }
  exercises?: Exercise[]
  fueling?: string
  gearTest?: boolean
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
  /** Uhrzeit-Vorschlag */
  startTime?: HHMM
  optional?: boolean
  movedFrom?: ISODate
  /** Optionale Hinweise */
  notes?: string[]
}

export interface DroppedSession {
  session: Session
  reason: string
}

export interface PlanDay {
  date: ISODate
  day: ResolvedDay
  sessions: Session[]
  dropped: DroppedSession[]
  microIndex: number
  mesoIndex: number
  phase: Phase
  isDeload: boolean
  notes: string[]
}

export interface MicroInfo {
  index: number
  /** -1 = Einstieg, 0..5 = M1..M6, 6 = Rennmikrozyklus */
  mesoIndex: number
  /** Position im Mesozyklus (0..6) */
  posInMeso: number
  start: ISODate
  end: ISODate
  phase: Phase
  isDeload: boolean
  isMountain: boolean
  hasNightRun: boolean
  hasStrengthTest: boolean
  /** Wochen-Äquivalent (km) und Mikrozyklus-Ziel */
  weeklyKm: number
  targetKm: number
  targetHm: number
  longRunKm: number
  /** Faktor aus Erholung (1 = unverändert) */
  recoveryFactor: number
}

export interface MesoInfo {
  index: number
  label: string
  start: ISODate
  end: ISODate
  phase: Phase
}

export interface Plan {
  days: PlanDay[]
  micros: MicroInfo[]
  mesos: MesoInfo[]
  byDate: Record<ISODate, PlanDay>
}

// ───────────── Kraft ─────────────

export type ProgressionId = 'pull' | 'push' | 'frontLever' | 'backLever' | 'core'

export interface ProgressionStage {
  name: string
  /** Vorgabe pro Einheit */
  sets: number
  reps?: number
  holdSec?: number
  /** Kriterium zum Aufsteigen, in Worten */
  criteria: string
  /** maschinenlesbar: alle Sätze mit mindestens reps bzw. holdSec */
  target: { sets: number; reps?: number; holdSec?: number }
  cue?: string
}

export interface StrengthState {
  stages: Record<ProgressionId, number>
  /** Wie oft die Kriterien der aktuellen Stufe zuletzt in Folge erfüllt wurden */
  streak: Record<ProgressionId, number>
  history: { date: ISODate; progression: ProgressionId; from: number; to: number; reason: string }[]
}

export interface StrengthTest {
  date: ISODate
  pullUps: number
  dips: number
  pushUps?: number
  hollowHoldSec: number
  frontLeverStage: number
  frontLeverHoldSec: number
  backLeverStage: number
  backLeverHoldSec: number
  notes?: string
}

// ───────────── Tracking ─────────────

export interface SetResult {
  exercise: string
  progression?: ProgressionId
  reps?: number[]
  holdSec?: number[]
}

export interface SessionLog {
  sessionId: string
  date: ISODate
  status: 'done' | 'partial' | 'skipped'
  /** Ausgeführt: die Anpassung oder der Originalplan */
  executed?: 'adjusted' | 'original'
  durationMin?: number
  distanceKm?: number
  elevationM?: number
  avgHr?: number
  strain?: number
  feeling?: 1 | 2 | 3 | 4 | 5
  notes?: string
  fueling?: { carbsPerHour?: number; drinkMl?: number; notes?: string }
  gearNotes?: string
  sets?: SetResult[]
  whoopWorkoutId?: string
  loggedAt?: string
}

export interface AdjustmentDecision {
  sessionId: string
  date: ISODate
  accepted: boolean
  original: string
  adjusted: string
  reason: string
  decidedAt: string
}

// ───────────── Erholung ─────────────

export type Color = 'green' | 'yellow' | 'red'

export interface ManualRecovery {
  date: ISODate
  sleepHours: number
  sleepQuality: 1 | 2 | 3 | 4 | 5
  feeling: 1 | 2 | 3 | 4 | 5
}

/** Erholungswerte, einem Trainingstag zugeordnet */
export interface RecoveryDay {
  date: ISODate
  source: 'whoop' | 'manual'
  recoveryScore?: number
  hrv?: number
  rhr?: number
  spo2?: number
  sleepHours?: number
  sleepPerformance?: number
  sleepEfficiency?: number
  sleepDebtH?: number
  sleepNeedH?: number
  strainPrevDay?: number
  sleepStart?: string
  sleepEnd?: string
  manual?: ManualRecovery
}

// ───────────── Einstellungen ─────────────

export interface Settings {
  profile: {
    weeklyKmStart: number
    longestRunKm: number
    gym: boolean
    calisthenicsPark: boolean
    calisthenicsLevel: string
    goals: string[]
    maxHr: number | null
    easyPace: number
    longPace: number
  }
  shift: {
    anchorDate: ISODate
    planStart: ISODate
    raceDate: ISODate
    commuteMin: number
    bufferMin: number
    morningRoutineMin: number
    napStart: HHMM
    postNightSleepStart: HHMM
    postNightSleepEnd: HHMM
  }
  weights: import('./config').RecoveryWeights
  notifications: { bedtime: boolean; nap: boolean }
}
