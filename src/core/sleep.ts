/**
 * Schlafempfehlungen (SPEC 6.3b). Pro Datum: Tagschlaf nach der Nachtschicht, Nap vor der
 * Nachtschicht und die Nacht (Abend dieses Datums → Morgen des Folgetags).
 */
import { RACE, SLEEP_DEFAULTS } from './config'
import { addMin, diffDays, fromMin, toMin } from './dates'
import { bedtimeForWake, departureTime, isEarlyWork, wakeBeforeWork } from './shifts'
import type { HHMM, ISODate, PlanDay, ResolvedDay, Settings } from './types'

export interface SleepBlock {
  start: HHMM
  end: HHMM
  /** Startet am Vortag (Nacht) oder Ende am Folgetag */
  endsNextDay?: boolean
}

export interface SleepPlan {
  date: ISODate
  /** Schlaf nach der Nachtschicht (morgens/mittags) */
  daySleep?: SleepBlock
  /** Nap vor der Nachtschicht oder am Renntag */
  nap?: SleepBlock
  /** Nacht: Schlafenszeit an diesem Abend, Aufstehen am Folgetag */
  night?: SleepBlock
  /** keine Nacht (Nachtschicht/Rennen) */
  noNightReason?: string
  departure?: HHMM
  latestTrainingEnd?: HHMM
  notes: string[]
  tip?: string
}

export interface SleepInput {
  day: ResolvedDay
  next?: ResolvedDay
  planDay?: PlanDay
  nextPlanDay?: PlanDay
  settings: Settings
  /** Schlafbedarf laut WHOOP (inkl. Defizit) in Stunden */
  needH?: number
  debtH?: number
}

const TIPS = [
  'Koffein spätestens 6 h vor dem Schlafen.',
  'Nach der Nachtschicht Sonnenbrille auf dem Heimweg – helles Licht meiden.',
  'Schlafzimmer dunkel, kühl (16–18 °C) und ruhig halten, Ohrstöpsel helfen am Tag.',
  'Vor dem Nap leicht essen, nicht mit vollem Magen hinlegen.',
  'Letzte große Mahlzeit 2–3 h vor dem Schlafen.',
  'Bildschirme 30–60 min vor dem Schlafen weglegen oder Nachtmodus.',
  'Nach langen Läufen: Kohlenhydrate + Eiweiß, dann früher ins Bett.',
  'Gleichbleibende Aufstehzeiten an freien Tagen stabilisieren den Rhythmus.',
  'Alkohol verschlechtert Schlaf und HRV deutlich.',
  'Nach dem Nap 10 min helles Licht und Bewegung, dann bist du schnell wach.',
]

/** Tipp: nicht jeden Tag, nicht immer derselbe (deterministisch nach Datum) */
export function tipFor(date: ISODate): string | undefined {
  const n = diffDays('2026-01-01', date)
  if (n % 3 !== 0) return undefined
  return TIPS[Math.floor(n / 3) % TIPS.length]
}

function earlier(t: HHMM, limit: HHMM): HHMM {
  return toMin(t) < toMin(limit) && toMin(t) > 12 * 60 ? limit : t
}

export function recommendSleep(input: SleepInput): SleepPlan {
  const { day, next, settings: s } = input
  const need = input.needH ?? SLEEP_DEFAULTS.defaultNeedH
  const debt = input.debtH ?? 0
  const notes: string[] = []
  const plan: SleepPlan = { date: day.date, notes, tip: tipFor(day.date) }
  const raceDays = diffDays(day.date, RACE.date)

  // Tagschlaf nach Nachtschicht
  if (day.kind === 'SLEEP_DAY' || (day.kind === 'NIGHT_SHIFT' && day.window?.start === '15:00')) {
    plan.daySleep = { start: s.shift.postNightSleepStart, end: s.shift.postNightSleepEnd }
    notes.push('Nach der Nachtschicht: Sonnenbrille auf dem Heimweg, Raum abdunkeln, Handy weg.')
  }

  // Nachtschicht heute → Nap, keine Nacht
  if (day.kind === 'NIGHT_SHIFT' && day.workStartActual) {
    const dep = departureTime(day.workStartActual, s)
    const latestWake = addMin(dep, -SLEEP_DEFAULTS.napWakeBeforeDepartureMin)
    const dur = debt >= SLEEP_DEFAULTS.napLongIfDebtH ? SLEEP_DEFAULTS.napLongMin : SLEEP_DEFAULTS.napMinMin
    const end = fromMin(Math.min(toMin(s.shift.napStart) + dur, toMin(latestWake)))
    plan.nap = { start: s.shift.napStart, end }
    plan.departure = dep
    plan.noNightReason = 'Nachtschicht'
    notes.push(`Nap ${s.shift.napStart}–${end} (${dur} min = ${dur >= 150 ? 'knapp zwei' : 'ein'} Schlafzyklus${dur >= 150 ? 'en' : ''}), Abfahrt ${dep}.`)
    if (day.window) plan.latestTrainingEnd = day.window.end
    return plan
  }

  // Renntag: Nap am Nachmittag, keine Nacht
  if (raceDays === 0) {
    plan.nap = { ...SLEEP_DEFAULTS.raceDayNap }
    plan.noNightReason = 'Rennen (Start 23:00)'
    notes.push('Renntag: ausschlafen, Nap am Nachmittag, letzte große Mahlzeit ca. 3 h vor dem Start.')
    return plan
  }

  let bed: HHMM
  let wake: HHMM
  if (next && isEarlyWork(next) && next.workStartActual) {
    // Abend vor Tagschicht/V-Schicht
    wake = wakeBeforeWork(next.workStartActual, s)
    bed = bedtimeForWake(wake, need)
    bed = earlier(bed, SLEEP_DEFAULTS.earliestBed)
    notes.push(`Aufstehen ${wake}, Abfahrt ${departureTime(next.workStartActual, s)}, Arbeitsbeginn ${next.workStartActual}.`)
  } else if (next?.kind === 'NIGHT_SHIFT') {
    // Nach der Tagschicht: normal schlafen, morgens ausschlafen
    bed = day.kind === 'DAY_SHIFT' ? '22:30' : SLEEP_DEFAULTS.normalBed
    wake = addMin(bed, Math.round(need * 60) + SLEEP_DEFAULTS.sleepLatencyMin + 45)
    notes.push('Vor der Nachtschicht: ausschlafen erlaubt – Reserven für die Nacht sammeln.')
  } else {
    // Freie Tage / Schlaftag-Abend: normaler Rhythmus
    bed = SLEEP_DEFAULTS.normalBed
    wake = SLEEP_DEFAULTS.normalWake
    if (day.kind === 'SLEEP_DAY') notes.push('Abend des Schlaftags: normale Uhrzeit, damit du schnell wieder im Tagesrhythmus bist.')
    // Schlafdefizit gezielt abbauen
    const debtShift = Math.min(SLEEP_DEFAULTS.debtEarlierMaxMin, Math.round(debt * SLEEP_DEFAULTS.debtEarlierMinPerH))
    // Vor Schlüsseleinheiten früher
    const keyTomorrow = input.nextPlanDay?.sessions.some((x) => x.key && x.type !== 'RACE')
    const keyShift = keyTomorrow ? SLEEP_DEFAULTS.beforeKeyEarlierMin : 0
    const hardToday = input.planDay?.sessions.some((x) => x.key || x.sensitivity === 'high')
    const extraAfterHard = hardToday ? 30 : 0
    bed = addMin(bed, -Math.max(debtShift, keyShift))
    if (keyTomorrow) notes.push(`Morgen steht ${input.nextPlanDay!.sessions.find((x) => x.key)!.title} an – ${keyShift} min früher ins Bett.`)
    if (debtShift > 0 && debtShift >= keyShift) notes.push(`Schlafdefizit ${debt.toFixed(1).replace('.', ',')} h – ${debtShift} min früher ins Bett.`)
    if (extraAfterHard) {
      wake = addMin(wake, extraAfterHard)
      notes.push('Nach dem harten Tag: 30 min länger schlafen.')
    }
    // Nachtlauf verschiebt die Nacht
    const nightRun = input.planDay?.sessions.find((x) => x.type === 'NIGHT_RUN')
    if (nightRun) {
      const end = toMin(nightRun.startTime ?? '21:00') + nightRun.durationMin
      bed = fromMin(end + SLEEP_DEFAULTS.afterNightRunMin)
      wake = fromMin(end + SLEEP_DEFAULTS.afterNightRunMin + Math.round(need * 60) + SLEEP_DEFAULTS.sleepLatencyMin)
      notes.push(`Nachtlauf: Schlaf erst nach dem Lauf, morgen entsprechend länger schlafen.`)
    }
  }

  // Rennvorbereitung: letzte 14 Tage
  if (raceDays > 0 && raceDays <= SLEEP_DEFAULTS.raceSleepPlanDays) {
    notes.push(raceDays === 1 ? 'Nacht vor dem Renntag: so viel schlafen wie möglich, morgen ausschlafen.' : `Noch ${raceDays} Tage: jede gute Nacht zählt – Schlafbank füllen.`)
    if (raceDays === 1) wake = addMin(wake, 90)
  }

  plan.night = { start: bed, end: wake, endsNextDay: true }
  if (day.kind === 'SLEEP_DAY') plan.latestTrainingEnd = addMin(bed, -SLEEP_DEFAULTS.trainingEndBeforeBedH * 60)
  return plan
}

// ───────────── Umsetzung ─────────────

export interface ActualSleep {
  /** lokale Zeiten */
  start: HHMM
  end: HHMM
}

/** 0–100: wie gut wurde die Empfehlung umgesetzt (Abweichung Schlafenszeit + Aufstehen) */
export function complianceScore(rec: SleepBlock, actual: ActualSleep): number {
  const dev = (a: HHMM, b: HHMM) => {
    let d = Math.abs(toMin(a) - toMin(b))
    if (d > 720) d = 1440 - d
    return d
  }
  const avg = (dev(rec.start, actual.start) + dev(rec.end, actual.end)) / 2
  return Math.max(0, Math.round(100 - avg / 1.5))
}

export function sleepDurationH(b: SleepBlock): number {
  let m = toMin(b.end) - toMin(b.start)
  if (m <= 0) m += 1440
  return m / 60
}


