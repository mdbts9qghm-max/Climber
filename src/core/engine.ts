/**
 * Zusammenspiel der Module: Plan + Erholung + Schlaf für einen Tag.
 * Wird von der UI und von Tests genutzt; selbst UI-unabhängig.
 */
import { computePatterns, type Patterns } from './analytics'
import { addDays, toMin } from './dates'
import { generatePlan } from './planner'
import { adjustDay, assess, computeMicroFactors, makeUpSuggestion, type AdjustedSession, type Assessment, type UpcomingDay } from './recovery'
import { resolveDays } from './shifts'
import { buildSkeleton } from './skeleton'
import { recommendSleep, type SleepPlan } from './sleep'
import { initialStrengthState } from './strength'
import type { DayOverride, ISODate, ManualRecovery, Plan, PlanDay, RecoveryDay, ResolvedDay, Session, SessionLog, Settings, StrengthState } from './types'
import { recoveryHistory, type WhoopData } from './whoop'

export interface EngineInput {
  settings: Settings
  overrides: DayOverride[]
  strength?: StrengthState
  logs?: SessionLog[]
  manual?: ManualRecovery[]
  whoop?: WhoopData | null
  today: ISODate
  now?: number
}

export interface Engine {
  input: EngineInput
  plan: Plan
  days: Map<ISODate, ResolvedDay>
  history: RecoveryDay[]
  patterns: Patterns
  microFactors: Record<number, number>
}

/** Vorlauf für Baselines (HRV/Ruhepuls) vor Planstart */
const HISTORY_LEAD_DAYS = 35

export function buildEngine(input: EngineInput): Engine {
  const s = input.settings
  const from = addDays(s.shift.planStart, -HISTORY_LEAD_DAYS)
  const resolved = resolveDays(from, addDays(s.shift.raceDate, 3), input.overrides, s)
  const days = new Map(resolved.map((d) => [d.date, d]))
  const history = recoveryHistory(
    resolved.filter((d) => d.date <= input.today),
    input.whoop ?? null,
    input.manual ?? [],
    input.now,
  )
  const microFactors = computeMicroFactors(buildSkeleton(s).micros, history)
  const plan = generatePlan({
    settings: s,
    overrides: input.overrides,
    strength: input.strength ?? initialStrengthState(),
    logs: input.logs ?? [],
    today: input.today,
    microFactors,
  })
  const patterns = computePatterns(plan.days, history, input.logs ?? [])
  return { input, plan, days, history, patterns, microFactors }
}

export interface DayView {
  date: ISODate
  day: ResolvedDay
  planDay: PlanDay | null
  assessment: Assessment
  adjusted: AdjustedSession[]
  sleep: SleepPlan
  upcoming: UpcomingDay[]
  suggestion: { session: Session; text: string } | null
}

export function dayView(e: Engine, date: ISODate): DayView {
  const day = e.days.get(date)!
  const prevDay = e.days.get(addDays(date, -1))
  const next = e.days.get(addDays(date, 1))
  const pd = e.plan.byDate[date] ?? null
  const rec = e.history.find((h) => h.date === date)
  const firstStart = pd?.sessions.find((x) => x.startTime)?.startTime ?? day.window?.start
  const assessment = assess({
    date,
    day,
    prevDay,
    today: rec,
    history: e.history.filter((h) => h.date < date),
    weights: e.input.settings.weights,
    trainingStartMin: firstStart ? toMin(firstStart) : undefined,
  })
  const upcoming: UpcomingDay[] = [1, 2]
    .map((n) => ({ n, d: addDays(date, n) }))
    .filter(({ d }) => e.days.has(d))
    .map(({ n, d }) => ({ date: d, daysAhead: n, day: e.days.get(d)!, sessions: e.plan.byDate[d]?.sessions ?? [] }))
  const adjusted = pd
    ? adjustDay(pd.sessions, { assessment, day, prevDay, upcoming, settings: e.input.settings, learnedNightShiftDrop: e.patterns.learnedNightShiftDrop })
    : []
  const sleep = recommendSleep({
    day,
    next,
    planDay: pd ?? undefined,
    nextPlanDay: e.plan.byDate[addDays(date, 1)],
    settings: e.input.settings,
    needH: rec?.sleepNeedH,
    debtH: rec?.sleepDebtH,
  })
  const recent = [1, 2, 3].map((n) => e.plan.byDate[addDays(date, -n)]).filter(Boolean)
  const suggestion = pd ? makeUpSuggestion(pd, recent, assessment) : null
  return { date, day, planDay: pd, assessment, adjusted, sleep, upcoming, suggestion }
}
