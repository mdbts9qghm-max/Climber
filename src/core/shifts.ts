/**
 * Schichtmodell (SPEC 4): Zyklustag, Overrides, effektive Tagesart und Trainingsfenster.
 */
import { SHIFTS, SLEEP_DEFAULTS, WINDOWS } from './config'
import { addDays, addMin, diffDays, mod, toMin } from './dates'
import type { CycleDay, DayKind, DayOverride, HHMM, ISODate, ResolvedDay, Settings, TimeWindow } from './types'

/** zyklustag = ((datum − anker) mod 5) + 1 */
export function cycleDay(date: ISODate, anchor: ISODate): CycleDay {
  return (mod(diffDays(anchor, date), 5) + 1) as CycleDay
}

type BaseShift = 'T' | 'N' | 'S' | 'F'
export function baseShift(cd: CycleDay): BaseShift {
  return cd === 1 ? 'T' : cd === 2 ? 'N' : cd === 3 ? 'S' : 'F'
}

interface Work {
  kind: 'DAY_SHIFT' | 'NIGHT_SHIFT' | 'V_SHIFT' | 'CUSTOM_WORK'
  start: HHMM
  end: HHMM
  endsNextDay: boolean
}

function workFor(shift: 'T' | 'N' | 'V'): Work {
  if (shift === 'T') return { kind: 'DAY_SHIFT', ...SHIFTS.T, endsNextDay: false }
  if (shift === 'N') return { kind: 'NIGHT_SHIFT', ...SHIFTS.N, endsNextDay: true }
  return { kind: 'V_SHIFT', ...SHIFTS.V, endsNextDay: false }
}

interface Effective {
  work: Work | null
  /** keine Arbeit, aber besondere Art */
  status: 'VACATION' | 'SICK' | 'FREE' | null
}

export function overrideMap(overrides: DayOverride[]): Map<ISODate, DayOverride> {
  return new Map(overrides.map((o) => [o.date, o]))
}

function effective(date: ISODate, anchor: ISODate, ov?: DayOverride): Effective {
  const base = baseShift(cycleDay(date, anchor))
  const baseWork: Work | null = base === 'T' ? workFor('T') : base === 'N' ? workFor('N') : null
  if (!ov) return { work: baseWork, status: null }
  switch (ov.type) {
    case 'V':
      return { work: workFor('V'), status: null }
    case 'URLAUB':
      return { work: null, status: 'VACATION' }
    case 'FREI':
      return { work: null, status: 'FREE' }
    case 'KRANK':
      return { work: null, status: 'SICK' }
    case 'TAUSCH':
      if (!ov.shift || ov.shift === 'F') return { work: null, status: 'FREE' }
      return { work: workFor(ov.shift), status: null }
    case 'UEBERSTUNDEN': {
      if (baseWork) return { work: { ...baseWork, end: ov.end ?? baseWork.end }, status: null }
      return {
        work: { kind: 'CUSTOM_WORK', start: ov.start ?? SHIFTS.FORTBILDUNG.start, end: ov.end ?? SHIFTS.FORTBILDUNG.end, endsNextDay: false },
        status: null,
      }
    }
    case 'FORTBILDUNG':
      return {
        work: { kind: 'CUSTOM_WORK', start: ov.start ?? SHIFTS.FORTBILDUNG.start, end: ov.end ?? SHIFTS.FORTBILDUNG.end, endsNextDay: false },
        status: null,
      }
  }
}

const LABELS: Record<DayKind, [string, string]> = {
  DAY_SHIFT: ['Tagschicht', 'T'],
  NIGHT_SHIFT: ['Nachtschicht', 'N'],
  SLEEP_DAY: ['Schlaftag', 'S'],
  FREE: ['Frei', 'F'],
  V_SHIFT: ['V-Schicht', 'V'],
  VACATION: ['Urlaub', 'U'],
  SICK: ['Krank', 'K'],
  CUSTOM_WORK: ['Fortbildung/Dienst', 'D'],
}

// ───────────── Aufstehen/Schlafen rund um die Arbeit ─────────────

export function departureTime(workStartActual: HHMM, s: Settings): HHMM {
  return addMin(workStartActual, -(s.shift.commuteMin + s.shift.bufferMin))
}

/** Aufstehzeit vor einem Frühdienst: Arbeitsbeginn − Weg − Puffer − Morgenroutine */
export function wakeBeforeWork(workStartActual: HHMM, s: Settings): HHMM {
  return addMin(departureTime(workStartActual, s), -s.shift.morningRoutineMin)
}

/** Schlafenszeit, damit der Schlafbedarf vor dem Aufstehen gedeckt ist */
export function bedtimeForWake(wake: HHMM, needH: number): HHMM {
  return addMin(wake, -Math.round(needH * 60) - SLEEP_DEFAULTS.sleepLatencyMin)
}

/** Arbeit beginnt am Vormittag → Abend davor ist ein "Abend vor Frühdienst" */
export function isEarlyWork(day: ResolvedDay | undefined): boolean {
  return !!day?.work && !day.work.endsNextDay && toMin(day.work.start) < 12 * 60
}

/** Grobe Schlafenszeit am Abend eines Tages (für Fensterberechnung; Details in sleep.ts) */
export function plannedBedtime(next: ResolvedDay | undefined, s: Settings, needH = SLEEP_DEFAULTS.defaultNeedH): HHMM {
  if (next && isEarlyWork(next) && next.workStartActual) {
    const bed = bedtimeForWake(wakeBeforeWork(next.workStartActual, s), needH)
    return toMin(bed) < toMin(SLEEP_DEFAULTS.earliestBed) ? SLEEP_DEFAULTS.earliestBed : bed
  }
  return SLEEP_DEFAULTS.normalBed
}

// ───────────── Auflösen ─────────────

/**
 * Löst einen Datumsbereich auf. Die Tagesart hängt vom Vortag (Schlaftag nach Nachtschicht)
 * und vom Folgetag (Fensterende, Nachtlauf) ab.
 */
export function resolveDays(start: ISODate, end: ISODate, overrides: DayOverride[], s: Settings): ResolvedDay[] {
  const map = overrideMap(overrides)
  const anchor = s.shift.anchorDate
  const n = diffDays(start, end) + 1
  const eff: Effective[] = []
  for (let i = -1; i <= n; i++) {
    const d = addDays(start, i)
    eff.push(effective(d, anchor, map.get(d)))
  }
  const kinds: DayKind[] = eff.map((e, i) => {
    if (e.work) return e.work.kind
    if (e.status === 'SICK') return 'SICK'
    const prev = eff[i - 1]
    if (prev?.work?.endsNextDay) return 'SLEEP_DAY'
    return e.status === 'VACATION' ? 'VACATION' : 'FREE'
  })

  const base: ResolvedDay[] = []
  for (let i = -1; i <= n; i++) {
    const d = addDays(start, i)
    const e = eff[i + 1]
    const kind = kinds[i + 1]
    const [label, short] = LABELS[kind]
    base.push({
      date: d,
      cycleDay: cycleDay(d, anchor),
      kind,
      work: e.work ? { start: e.work.start, end: e.work.end, endsNextDay: e.work.endsNextDay } : null,
      workStartActual: e.work ? addMin(e.work.start, -SHIFTS.earlyStartMin) : null,
      label,
      short,
      override: map.get(d),
      window: null,
      availability: 'none',
      nightRunAllowed: false,
    })
  }
  // Fenster mit Kenntnis von Vor- und Folgetag
  for (let i = 1; i <= n; i++) {
    const day = base[i]
    const prev = base[i - 1]
    const next = base[i + 1]
    const { window, availability, nightRunAllowed } = trainingWindow(day, prev, next, s)
    day.window = window
    day.availability = availability
    day.nightRunAllowed = nightRunAllowed
  }
  return base.slice(1, n + 1)
}

export function resolveDay(date: ISODate, overrides: DayOverride[], s: Settings): ResolvedDay {
  return resolveDays(date, date, overrides, s)[0]
}

const isFreeKind = (k: DayKind | undefined) => k === 'FREE' || k === 'VACATION'

/** Harte Regeln aus SPEC 4.3 */
export function trainingWindow(
  day: ResolvedDay,
  prev: ResolvedDay | undefined,
  next: ResolvedDay | undefined,
  s: Settings,
): { window: TimeWindow | null; availability: ResolvedDay['availability']; nightRunAllowed: boolean } {
  const none = { window: null, availability: 'none' as const, nightRunAllowed: false }
  switch (day.kind) {
    case 'DAY_SHIFT':
    case 'V_SHIFT':
    case 'CUSTOM_WORK':
    case 'SICK':
      return none
    case 'NIGHT_SHIFT': {
      // Nach einer Nachtschicht direkt wieder Nacht: erst nach dem Tagschlaf
      const start = prev?.kind === 'NIGHT_SHIFT' ? WINDOWS.sleepDayStart : WINDOWS.nightShiftStart
      const end = addMin(s.shift.napStart, -WINDOWS.mealBufferBeforeNapMin)
      if (toMin(end) - toMin(start) < WINDOWS.minWindowMin) return none
      return { window: { start, end }, availability: 'limited', nightRunAllowed: false }
    }
    case 'SLEEP_DAY': {
      const bed = plannedBedtime(next, s)
      const end = addMin(bed, -SLEEP_DEFAULTS.trainingEndBeforeBedH * 60)
      const start = WINDOWS.sleepDayStart
      if (toMin(end) - toMin(start) < WINDOWS.minWindowMin) return none
      return { window: { start, end }, availability: 'optional', nightRunAllowed: false }
    }
    case 'FREE':
    case 'VACATION': {
      let end: HHMM = WINDOWS.freeEnd
      if (isEarlyWork(next)) {
        const limit = addMin(plannedBedtime(next, s), -90)
        if (toMin(limit) < toMin(end)) end = limit
      }
      return {
        window: { start: WINDOWS.freeStart, end },
        availability: 'full',
        nightRunAllowed: isFreeKind(next?.kind),
      }
    }
  }
}

/** Kann an diesem Tag geplant trainiert werden? */
export function isTrainable(day: ResolvedDay): boolean {
  return day.availability !== 'none'
}

export function windowMinutes(w: TimeWindow | null): number {
  if (!w) return 0
  const m = toMin(w.end) - toMin(w.start)
  return w.endsNextDay ? m + 1440 : m
}
