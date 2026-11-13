/**
 * Auswertungen (SPEC 6.4): Wie reagieren Recovery und HRV auf Nachtschichten, lange Läufe
 * und Krafttraining? Ab ca. 6 Wochen Daten fließen die Muster optional in die Vorausschau ein.
 */
import { ANALYTICS } from './config'
import { addDays } from './dates'
import { HEAVY_LEG_TYPES, LONG_TYPES } from './sessions'
import type { DayKind, ISODate, PlanDay, RecoveryDay, SessionLog } from './types'

export interface Effect {
  label: string
  n: number
  /** Abweichung der Recovery vom persönlichen Mittel (Punkte) */
  recoveryDelta: number | null
  /** Abweichung der HRV vom persönlichen Mittel (%) */
  hrvDeltaPct: number | null
}

export interface Patterns {
  days: number
  ready: boolean
  meanRecovery: number | null
  meanHrv: number | null
  effects: { afterNightShift: Effect; afterLongRun: Effect; afterStrength: Effect }
  byKind: Partial<Record<DayKind, number>>
  /** Für die Vorausschau: erwarteter Abfall nach Nachtschicht (positiv = Abfall) */
  learnedNightShiftDrop?: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function computePatterns(days: PlanDay[], history: RecoveryDay[], logs: SessionLog[] = []): Patterns {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const scored = history.filter((h) => h.recoveryScore !== undefined)
  const meanRecovery = mean(scored.map((h) => h.recoveryScore!))
  const hrvs = history.filter((h) => h.hrv !== undefined)
  const meanHrv = mean(hrvs.map((h) => h.hrv!))
  const done = new Set(logs.filter((l) => l.status !== 'skipped').map((l) => l.sessionId))
  const hasLogs = logs.length > 0

  const effect = (label: string, pred: (prev: PlanDay | undefined, date: ISODate) => boolean): Effect => {
    const sel = history.filter((h) => pred(byDate.get(addDays(h.date, -1)), h.date))
    const rec = sel.filter((h) => h.recoveryScore !== undefined).map((h) => h.recoveryScore!)
    const hrv = sel.filter((h) => h.hrv !== undefined).map((h) => h.hrv!)
    const mr = mean(rec)
    const mh = mean(hrv)
    return {
      label,
      n: sel.length,
      recoveryDelta: mr !== null && meanRecovery !== null && rec.length >= ANALYTICS.minSamples ? Math.round(mr - meanRecovery) : null,
      hrvDeltaPct: mh !== null && meanHrv ? (hrv.length >= ANALYTICS.minSamples ? Math.round(((mh - meanHrv) / meanHrv) * 100) : null) : null,
    }
  }
  const did = (pd: PlanDay | undefined, types: string[]) => !!pd?.sessions.some((s) => types.includes(s.type) && (!hasLogs || done.has(s.id)))
  const effects = {
    afterNightShift: effect('Nach Nachtschicht', (prev) => prev?.day.kind === 'NIGHT_SHIFT'),
    afterLongRun: effect('Nach langem Lauf', (prev) => did(prev, LONG_TYPES)),
    afterStrength: effect('Nach Krafttraining', (prev) => did(prev, [...HEAVY_LEG_TYPES, 'CALI_MAIN'])),
  }
  const byKind: Patterns['byKind'] = {}
  const groups = new Map<DayKind, number[]>()
  for (const h of scored) {
    const k = byDate.get(h.date)?.day.kind
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), h.recoveryScore!])
  }
  for (const [k, v] of groups) byKind[k] = Math.round(mean(v)!)
  const ready = history.length >= ANALYTICS.minDays
  const drop = effects.afterNightShift.recoveryDelta
  return {
    days: history.length,
    ready,
    meanRecovery: meanRecovery !== null ? Math.round(meanRecovery) : null,
    meanHrv: meanHrv !== null ? Math.round(meanHrv) : null,
    effects,
    byKind,
    learnedNightShiftDrop: ready && drop !== null && drop < 0 ? -drop : undefined,
  }
}
