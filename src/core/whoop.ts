/**
 * WHOOP-Daten (API v2) → Erholungswerte pro Trainingstag und Ist-Werte pro Einheit.
 *
 * Wichtig (SPEC 8): Nach Nachtschichten liegt der Hauptschlaf am Tag. Deshalb wird die
 * Recovery über WHOOP-Zyklen zugeordnet, nicht über Kalendertage: Ein Trainingstag bekommt
 * die Recovery des Zyklus, der zum geplanten Trainingsbeginn läuft. Ein WHOOP-Zyklus beginnt
 * mit dem Einschlafen; nach der Nachtschicht also mit dem Tagschlaf um ca. 08:00.
 */
import { WHOOP } from './config'
import { addDays, berlinParts, berlinToUtcMs } from './dates'
import type { ISODate, ManualRecovery, PlanDay, RecoveryDay, ResolvedDay, Session } from './types'

export interface WhoopCycle {
  id: number
  start: string
  end: string | null
  timezone_offset?: string
  score_state: string
  score?: { strain: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number }
}

export interface WhoopRecovery {
  cycle_id: number
  sleep_id: string
  score_state: string
  created_at?: string
  updated_at?: string
  score?: {
    user_calibrating?: boolean
    recovery_score: number
    resting_heart_rate: number
    hrv_rmssd_milli: number
    spo2_percentage?: number
    skin_temp_celsius?: number
  }
}

export interface WhoopSleep {
  id: string
  cycle_id?: number
  start: string
  end: string
  nap: boolean
  score_state: string
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number
      total_awake_time_milli?: number
      total_light_sleep_time_milli?: number
      total_slow_wave_sleep_time_milli?: number
      total_rem_sleep_time_milli?: number
    }
    sleep_needed?: {
      baseline_milli?: number
      need_from_sleep_debt_milli?: number
      need_from_recent_strain_milli?: number
      need_from_recent_nap_milli?: number
    }
    sleep_performance_percentage?: number
    sleep_efficiency_percentage?: number
    sleep_consistency_percentage?: number
  }
}

export interface WhoopWorkout {
  id: string
  start: string
  end: string
  sport_name?: string
  score_state: string
  score?: {
    strain?: number
    average_heart_rate?: number
    max_heart_rate?: number
    kilojoule?: number
    distance_meter?: number
    altitude_gain_meter?: number
    zone_durations?: Record<string, number>
  }
}

export interface WhoopData {
  cycles: WhoopCycle[]
  recoveries: WhoopRecovery[]
  sleeps: WhoopSleep[]
  workouts: WhoopWorkout[]
  maxHr?: number | null
}

const H = 3_600_000

/** Geplanter Trainingsbeginn eines Tages (für die Zyklus-Zuordnung) */
export function trainingStartOf(day: ResolvedDay): string {
  return day.window?.start ?? '12:00'
}

/** Zyklus, der zum Trainingsbeginn läuft (start ≤ t < end; offene Zyklen zählen bis jetzt) */
export function cycleForDay(day: ResolvedDay, cycles: WhoopCycle[], now: number = Date.now()): WhoopCycle | undefined {
  const t = berlinToUtcMs(day.date, trainingStartOf(day))
  const sorted = [...cycles].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  for (const c of sorted) {
    const s = Date.parse(c.start)
    const e = c.end ? Date.parse(c.end) : Math.max(now, t + 1)
    if (s <= t && t < e) return c
  }
  // Trainingsbeginn liegt vor dem Aufwachen-Zyklus (z. B. Daten noch nicht da): letzter Zyklus, der an diesem Tag begann
  const sameDay = sorted.filter((c) => berlinParts(c.start).date === day.date && Date.parse(c.start) <= t + 6 * H)
  return sameDay[sameDay.length - 1]
}

export function sleepHoursOf(sl: WhoopSleep): number | undefined {
  const st = sl.score?.stage_summary
  if (!st) return (Date.parse(sl.end) - Date.parse(sl.start)) / H
  const asleep = (st.total_light_sleep_time_milli ?? 0) + (st.total_slow_wave_sleep_time_milli ?? 0) + (st.total_rem_sleep_time_milli ?? 0)
  if (asleep > 0) return asleep / H
  if (st.total_in_bed_time_milli) return (st.total_in_bed_time_milli - (st.total_awake_time_milli ?? 0)) / H
  return undefined
}

export function sleepNeedOf(sl: WhoopSleep): { needH?: number; debtH?: number } {
  const n = sl.score?.sleep_needed
  if (!n) return {}
  const need = (n.baseline_milli ?? 0) + (n.need_from_sleep_debt_milli ?? 0) + (n.need_from_recent_strain_milli ?? 0) - (n.need_from_recent_nap_milli ?? 0)
  return { needH: need > 0 ? need / H : undefined, debtH: n.need_from_sleep_debt_milli !== undefined ? n.need_from_sleep_debt_milli / H : undefined }
}

/** Erholungswerte für einen Trainingstag aus WHOOP (über den Zyklus) */
export function recoveryForDay(day: ResolvedDay, data: WhoopData, now?: number): RecoveryDay | undefined {
  const cycle = cycleForDay(day, data.cycles, now)
  if (!cycle) return undefined
  const rec = data.recoveries.find((r) => r.cycle_id === cycle.id && r.score_state === 'SCORED' && r.score)
  if (!rec?.score) return undefined
  const sleep = data.sleeps.find((s) => s.id === rec.sleep_id) ?? data.sleeps.find((s) => !s.nap && s.cycle_id === cycle.id)
  const sorted = [...data.cycles].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const prev = sorted[sorted.findIndex((c) => c.id === cycle.id) - 1]
  const need = sleep ? sleepNeedOf(sleep) : {}
  return {
    date: day.date,
    source: 'whoop',
    recoveryScore: Math.round(rec.score.recovery_score),
    hrv: Math.round(rec.score.hrv_rmssd_milli * 10) / 10,
    rhr: Math.round(rec.score.resting_heart_rate),
    spo2: rec.score.spo2_percentage,
    sleepHours: sleep ? round2(sleepHoursOf(sleep)) : undefined,
    sleepPerformance: sleep?.score?.sleep_performance_percentage,
    sleepEfficiency: sleep?.score?.sleep_efficiency_percentage,
    sleepNeedH: round2(need.needH),
    sleepDebtH: round2(need.debtH),
    strainPrevDay: prev?.score?.strain !== undefined ? Math.round(prev.score.strain * 10) / 10 : undefined,
    sleepStart: sleep?.start,
    sleepEnd: sleep?.end,
  }
}

const round2 = (x: number | undefined) => (x === undefined ? undefined : Math.round(x * 100) / 100)

/**
 * Verlauf für einen Zeitraum: WHOOP, wenn vorhanden, sonst manuelle Eingabe.
 * Eine manuelle Eingabe für einen Tag gilt als bewusste Korrektur und hat Vorrang;
 * HRV/Ruhepuls von WHOOP bleiben dann für die Baselines erhalten.
 */
export function recoveryHistory(days: ResolvedDay[], data: WhoopData | null, manual: ManualRecovery[], now?: number): RecoveryDay[] {
  const manualBy = new Map(manual.map((m) => [m.date, m]))
  const out: RecoveryDay[] = []
  for (const d of days) {
    const w = data ? recoveryForDay(d, data, now) : undefined
    const m = manualBy.get(d.date)
    if (m) out.push({ date: d.date, source: 'manual', sleepHours: m.sleepHours, manual: m, hrv: w?.hrv, rhr: w?.rhr, sleepDebtH: w?.sleepDebtH, sleepNeedH: w?.sleepNeedH })
    else if (w) out.push(w)
  }
  return out
}

// ───────────── Workouts → Einheiten ─────────────

const RUN_SPORTS = ['running', 'run', 'trail', 'hiking', 'rucking', 'walking', 'stairmaster', 'treadmill', 'stair']
const STRENGTH_SPORTS = ['weightlifting', 'functional', 'calisthenics', 'powerlifting', 'strength', 'gymnastics', 'climber']

export function sportCategory(name?: string): 'run' | 'strength' | 'other' {
  const n = (name ?? '').toLowerCase()
  if (RUN_SPORTS.some((x) => n.includes(x))) return 'run'
  if (STRENGTH_SPORTS.some((x) => n.includes(x))) return 'strength'
  return 'other'
}

export interface WorkoutActuals {
  durationMin: number
  strain?: number
  avgHr?: number
  maxHr?: number
  distanceKm?: number
  elevationM?: number
  zonesMin?: number[]
}

export function workoutActuals(w: WhoopWorkout): WorkoutActuals {
  const z = w.score?.zone_durations
  const zones = z
    ? ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'].map((k) => Math.round((z[k] ?? 0) / 60000))
    : undefined
  return {
    durationMin: Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000),
    strain: w.score?.strain !== undefined ? Math.round(w.score.strain * 10) / 10 : undefined,
    avgHr: w.score?.average_heart_rate,
    maxHr: w.score?.max_heart_rate,
    distanceKm: w.score?.distance_meter !== undefined ? Math.round(w.score.distance_meter / 100) / 10 : undefined,
    elevationM: w.score?.altitude_gain_meter !== undefined ? Math.round(w.score.altitude_gain_meter) : undefined,
    zonesMin: zones,
  }
}

/**
 * Ordnet WHOOP-Workouts automatisch geplanten Einheiten zu (Datum, Kategorie, Startzeit).
 * `manual` enthält Korrekturen des Nutzers (workoutId → sessionId oder null = keine Zuordnung).
 */
export function matchWorkouts(days: PlanDay[], workouts: WhoopWorkout[], manual: Record<string, string | null> = {}): Map<string, string> {
  const result = new Map<string, string>()
  const taken = new Set<string>()
  for (const [wid, sid] of Object.entries(manual)) {
    if (sid) {
      result.set(wid, sid)
      taken.add(sid)
    }
  }
  const byDate = new Map(days.map((d) => [d.date, d]))
  const sorted = [...workouts].filter((w) => w.score_state === 'SCORED' || w.score_state === undefined).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  for (const w of sorted) {
    if (w.id in manual) continue
    const local = berlinParts(w.start)
    const cat = sportCategory(w.sport_name)
    // Nachtlauf über Mitternacht: auch den Vortag prüfen
    const candidates: { s: Session; date: ISODate }[] = []
    for (const date of [local.date, addDays(local.date, -1)]) {
      for (const s of byDate.get(date)?.sessions ?? []) candidates.push({ s, date })
    }
    let best: { id: string; cost: number } | null = null
    for (const { s, date } of candidates) {
      if (taken.has(s.id)) continue
      const sc = s.category === 'run' || s.category === 'race' ? 'run' : s.category === 'mobility' ? 'other' : 'strength'
      if (cat !== 'other' && sc !== cat) continue
      const planned = berlinToUtcMs(date, s.startTime ?? '09:00')
      const diffH = Math.abs(Date.parse(w.start) - planned) / H
      if (date !== local.date && diffH > WHOOP.matchToleranceH) continue
      const cost = diffH + (cat === 'other' ? 5 : 0)
      if (!best || cost < best.cost) best = { id: s.id, cost }
    }
    if (best) {
      result.set(w.id, best.id)
      taken.add(best.id)
    }
  }
  return result
}

/** HF-Zonen in Schlägen aus max. HF (WHOOP-Profil) */
export function hrZones(maxHr: number): { zone: number; from: number; to: number }[] {
  return WHOOP.zones.map((z) => ({ zone: z.zone, from: Math.round((maxHr * z.from) / 100), to: Math.round((maxHr * z.to) / 100) }))
}
