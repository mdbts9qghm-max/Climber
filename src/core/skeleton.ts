/**
 * Plan-Skelett: Einstiegsblock, M1–M6 (je 7 Mikrozyklen à 5 Tage), Rennmikrozyklus.
 * Phasen, Entlastungen, Bergwochenenden, Nachtläufe, Krafttests und Umfangsziele.
 */
import { MOUNTAIN_WEEKENDS, NIGHT_RUNS, PLAN, VOLUME } from './config'
import { addDays, diffDays } from './dates'
import { cycleDay } from './shifts'
import type { ISODate, MesoInfo, MicroInfo, Phase, Settings } from './types'

export interface Skeleton {
  micros: MicroInfo[]
  mesos: MesoInfo[]
  start: ISODate
  end: ISODate
}

export const PHASE_LABEL: Record<Phase, string> = {
  intro: 'Einstieg',
  base: 'Grundlage',
  build: 'Aufbau',
  specific: 'Rennspezifisch',
  taper: 'Tapering',
  race: 'Rennwoche',
}

function phaseFor(meso: number, pos: number): Phase {
  if (meso <= 1) return 'base'
  if (meso <= 3) return 'build'
  if (meso === 4) return 'specific'
  return pos <= 4 ? 'specific' : 'taper'
}

/** Erster Zyklustag 1 an/nach dem Planstart */
export function firstMesoStart(s: Settings): ISODate {
  let d = s.shift.planStart
  while (cycleDay(d, s.shift.anchorDate) !== 1) d = addDays(d, 1)
  return d
}

const round1 = (x: number) => Math.round(x * 10) / 10
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Typ des Mikrozyklus für die Verteilung */
export function microStyle(m: Pick<MicroInfo, 'phase' | 'isDeload' | 'isMountain' | 'hasNightRun' | 'posInMeso' | 'mesoIndex'>): 'standard' | 'b2b' | 'mountain' {
  if (m.isMountain) return 'mountain'
  if (m.isDeload) return 'standard'
  if (m.phase === 'build' && m.mesoIndex >= 3 && m.posInMeso % 2 === 1) return 'b2b'
  if (m.phase === 'specific' && !m.hasNightRun) return 'b2b'
  return 'standard'
}

/**
 * @param microFactors Reduktion je Mikrozyklus-Index aus der Erholung (z. B. {12: 0.85})
 */
export function buildSkeleton(s: Settings, microFactors: Record<number, number> = {}): Skeleton {
  const raceDate = s.shift.raceDate
  const m1 = firstMesoStart(s)
  const micros: MicroInfo[] = []
  const mesos: MesoInfo[] = []

  const base = (partial: Omit<MicroInfo, 'weeklyKm' | 'targetKm' | 'targetHm' | 'longRunKm' | 'recoveryFactor'>): MicroInfo => ({
    ...partial,
    weeklyKm: 0,
    targetKm: 0,
    targetHm: 0,
    longRunKm: 0,
    recoveryFactor: 1,
  })

  // Einstiegsblock (falls Planstart nicht auf Tag 1 fällt)
  if (m1 > s.shift.planStart) {
    micros.push(
      base({
        index: 0,
        mesoIndex: -1,
        posInMeso: 0,
        start: s.shift.planStart,
        end: addDays(m1, -1),
        phase: 'intro',
        isDeload: false,
        isMountain: false,
        hasNightRun: false,
        hasStrengthTest: true,
      }),
    )
    mesos.push({ index: -1, label: 'Einstieg', start: s.shift.planStart, end: addDays(m1, -1), phase: 'intro' })
  }

  // M1–M6, so viele wie bis zum Rennmikrozyklus passen
  const raceMicroStart = addDays(raceDate, -4)
  const totalMicros = Math.floor(diffDays(m1, raceMicroStart) / PLAN.microLength)
  const mesoCount = Math.min(PLAN.mesoCount, Math.ceil(totalMicros / PLAN.microsPerMeso))
  for (let mi = 0; mi < mesoCount; mi++) {
    const mStart = addDays(m1, mi * PLAN.microsPerMeso * PLAN.microLength)
    const mEnd = addDays(mStart, PLAN.microsPerMeso * PLAN.microLength - 1)
    mesos.push({ index: mi, label: `M${mi + 1}`, start: mStart, end: mEnd < raceMicroStart ? mEnd : addDays(raceMicroStart, -1), phase: phaseFor(mi, 0) })
    for (let pos = 0; pos < PLAN.microsPerMeso; pos++) {
      const start = addDays(mStart, pos * PLAN.microLength)
      if (start >= raceMicroStart) break
      const phase = phaseFor(mi, pos)
      const isDeload = phase !== 'taper' && pos === PLAN.microsPerMeso - 1
      const isMountain = MOUNTAIN_WEEKENDS.some(([m, p]) => m === mi + 1 && p === pos + 1)
      const hasNightRun =
        !isDeload &&
        !isMountain &&
        mi + 1 >= NIGHT_RUNS.fromMeso &&
        ((phase === 'build' && pos + 1 === NIGHT_RUNS.buildOnlyMicro) || (phase === 'specific' && pos % NIGHT_RUNS.specificEveryNth === 1))
      micros.push(
        base({
          index: micros.length,
          mesoIndex: mi,
          posInMeso: pos,
          start,
          end: addDays(start, PLAN.microLength - 1),
          phase,
          isDeload,
          isMountain,
          hasNightRun,
          hasStrengthTest: isDeload,
        }),
      )
    }
  }
  // Rennmikrozyklus
  micros.push(
    base({
      index: micros.length,
      mesoIndex: mesoCount,
      posInMeso: 0,
      start: raceMicroStart,
      end: raceDate,
      phase: 'race',
      isDeload: false,
      isMountain: false,
      hasNightRun: false,
      hasStrengthTest: false,
    }),
  )
  mesos.push({ index: mesoCount, label: 'Rennwoche', start: raceMicroStart, end: raceDate, phase: 'race' })
  for (const meso of mesos) if (meso.index >= 0 && meso.index < mesoCount) meso.phase = phaseFor(meso.index, 0)

  // ───── Umfang ─────
  let level = s.profile.weeklyKmStart
  let peak = level
  let taperIdx = 0
  let lastLong = 0
  for (const m of micros) {
    let weekly: number
    if (m.phase === 'intro') weekly = level
    else if (m.phase === 'race') weekly = peak * VOLUME.raceMicroFactor
    else if (m.phase === 'taper') weekly = peak * VOLUME.taperFactors[Math.min(taperIdx++, VOLUME.taperFactors.length - 1)]
    else if (m.isDeload) weekly = level * VOLUME.deloadFactor
    else {
      level = Math.min(VOLUME.weeklyCap[m.phase], level * VOLUME.growthPerMicro)
      level = Math.max(level, Math.min(s.profile.weeklyKmStart, VOLUME.weeklyCap[m.phase]))
      weekly = level
      peak = Math.max(peak, level)
    }
    const factor = microFactors[m.index] ?? 1
    m.recoveryFactor = factor
    m.weeklyKm = round1(weekly * factor)
    const days = diffDays(m.start, m.end) + 1
    const mountain = m.isMountain ? VOLUME.mountainFactor : 1
    m.targetKm = round1(((m.weeklyKm * days) / 7) * mountain)
    m.targetHm = Math.round((m.targetKm * VOLUME.hmPerKm[m.phase]) / 10) * 10
    const [lo, hi] = VOLUME.longRun[m.phase]
    const style = microStyle(m)
    const share = style === 'b2b' ? VOLUME.b2bShares.long : style === 'mountain' ? VOLUME.mountainShares.day1 : VOLUME.longShare[m.phase]
    let long = clamp(m.targetKm * share, lo, hi)
    if (m.hasNightRun) long = Math.min(long, NIGHT_RUNS.maxKm)
    const growing = !m.isDeload && !m.isMountain && m.phase !== 'taper' && m.phase !== 'race'
    if (growing && lastLong > 0) long = Math.min(long, lastLong * VOLUME.longGrowthPerMicro)
    if (growing) lastLong = Math.max(lastLong, long)
    m.longRunKm = m.phase === 'race' ? 0 : round1(long)
  }
  return { micros, mesos, start: s.shift.planStart, end: raceDate }
}

export function microForDate(sk: Skeleton, d: ISODate): MicroInfo | undefined {
  return sk.micros.find((m) => m.start <= d && d <= m.end)
}
