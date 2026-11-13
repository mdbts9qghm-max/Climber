/** Umrechnung auf Kalenderwochen (SPEC 5.1): vertraute Wochenkilometer/-höhenmeter. */
import { addDays, isoWeek, mondayOf } from './dates'
import type { ISODate, Plan, SessionLog } from './types'

export interface WeekTotal {
  key: string
  label: string
  monday: ISODate
  plannedKm: number
  plannedHm: number
  actualKm: number
  actualHm: number
}

export function weeklyTotals(plan: Plan, logs: SessionLog[] = []): WeekTotal[] {
  const logBy = new Map(logs.map((l) => [l.sessionId, l]))
  const weeks = new Map<string, WeekTotal>()
  for (const pd of plan.days) {
    const { year, week } = isoWeek(pd.date)
    const key = `${year}-W${String(week).padStart(2, '0')}`
    if (!weeks.has(key)) weeks.set(key, { key, label: `KW ${week}`, monday: mondayOf(pd.date), plannedKm: 0, plannedHm: 0, actualKm: 0, actualHm: 0 })
    const w = weeks.get(key)!
    for (const s of pd.sessions) {
      if (s.type === 'RACE' || s.category !== 'run') continue
      w.plannedKm += s.distanceKm ?? 0
      w.plannedHm += s.elevationM ?? 0
    }
  }
  // Ist-Werte nach tatsächlichem Datum des Logs
  for (const l of logBy.values()) {
    if (l.status === 'skipped') continue
    const { year, week } = isoWeek(l.date)
    const key = `${year}-W${String(week).padStart(2, '0')}`
    const w = weeks.get(key)
    if (!w) continue
    w.actualKm += l.distanceKm ?? 0
    w.actualHm += l.elevationM ?? 0
  }
  return [...weeks.values()].map((w) => ({
    ...w,
    plannedKm: Math.round(w.plannedKm * 10) / 10,
    plannedHm: Math.round(w.plannedHm),
    actualKm: Math.round(w.actualKm * 10) / 10,
    actualHm: Math.round(w.actualHm),
  }))
}

export function weekRange(monday: ISODate): [ISODate, ISODate] {
  return [monday, addDays(monday, 6)]
}
