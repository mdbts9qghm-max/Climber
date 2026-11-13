import { defaultOverrides, defaultSettings } from '../settings'
import type { RecoveryDay, ResolvedDay, Session, Settings } from '../types'
import { resolveDay } from '../shifts'
import { easyRun, hillIntervals, threshold, legs, longRun, b2bRun, hillTreadmill, caliMain, mobility, strengthTest, recoveryRun, type BuildCtx } from '../sessions'
import { initialStrengthState } from '../strength'
import { assess, type Assessment } from '../recovery'

export const S: Settings = defaultSettings()
export const OV = defaultOverrides()

export function ctx(date: string, slot = 'x', phase: BuildCtx['phase'] = 'build'): BuildCtx {
  return { date, slot, phase, settings: S, strength: initialStrengthState() }
}

export function day(date: string, overrides = OV): ResolvedDay {
  return resolveDay(date, overrides, S)
}

export function rec(date: string, score: number, extra: Partial<RecoveryDay> = {}): RecoveryDay {
  return { date, source: 'whoop', recoveryScore: score, sleepHours: 7.5, sleepNeedH: 8, ...extra }
}

export function assessFor(date: string, score: number | null, extra: Partial<RecoveryDay> = {}, history: RecoveryDay[] = []): Assessment {
  const d = day(date)
  return assess({ date, day: d, prevDay: day(addDaysLocal(date, -1)), today: score === null ? undefined : rec(date, score, extra), history, weights: S.weights })
}

function addDaysLocal(d: string, n: number) {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000
  return new Date(t).toISOString().slice(0, 10)
}
export const addDays = addDaysLocal

/** Ein Exemplar jedes Einheitentyps (Datum egal) */
export function allTypes(date: string): Session[] {
  const c = (slot: string) => ctx(date, slot)
  return [
    hillIntervals(c('a'), 8),
    threshold(c('b'), 8),
    legs(c('c'), 'heavy'),
    strengthTest(c('d')),
    longRun(c('e'), 25),
    b2bRun(c('f'), 15),
    hillTreadmill(c('g'), 8),
    caliMain(c('h')),
    easyRun(c('i'), 8),
    recoveryRun(c('j'), 5),
    mobility(c('k'), 20),
  ]
}
