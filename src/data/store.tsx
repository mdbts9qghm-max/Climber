/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import {
  addDays,
  applySessionResults,
  applyStrengthTest,
  buildEngine,
  matchWorkouts,
  workoutActuals,
  sampleWhoop,
  todayBerlin,
  type AdjustmentDecision,
  type DayOverride,
  type Engine,
  type ISODate,
  type ManualRecovery,
  type SessionLog,
  type Settings,
  type StrengthTest,
  type WhoopData,
} from '../core'
import { loadLocal, loadWhoopCache, saveLocal, saveWhoopCache } from './localRepo'
import { initialState, normalizeState, type AppState } from './state'
import { remote } from './sync'
import { syncWhoop } from './whoopClient'
import { syncReminders } from './push'

export type Action =
  | { type: 'replace'; state: AppState }
  | { type: 'settings'; settings: Settings }
  | { type: 'onboarded' }
  | { type: 'override'; override: DayOverride }
  | { type: 'removeOverride'; date: ISODate }
  | { type: 'overrides'; overrides: DayOverride[] }
  | { type: 'log'; log: SessionLog }
  | { type: 'removeLog'; sessionId: string }
  | { type: 'test'; test: StrengthTest }
  | { type: 'manual'; entry: ManualRecovery }
  | { type: 'decision'; decision: AdjustmentDecision }
  | { type: 'assignWorkout'; workoutId: string; sessionId: string | null }
  | { type: 'checklist'; key: string; value: boolean }
  | { type: 'demo'; value: boolean }

function latestTest(s: AppState) {
  return [...s.strengthTests].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)
}

export function reducer(state: AppState, a: Action): AppState {
  const stamp = (s: AppState): AppState => ({ ...s, updatedAt: new Date().toISOString() })
  switch (a.type) {
    case 'replace':
      return a.state
    case 'settings':
      return stamp({ ...state, settings: a.settings })
    case 'onboarded':
      return stamp({ ...state, onboarded: true })
    case 'override':
      return stamp({ ...state, overrides: [...state.overrides.filter((o) => o.date !== a.override.date), a.override].sort((x, y) => (x.date < y.date ? -1 : 1)) })
    case 'removeOverride':
      return stamp({ ...state, overrides: state.overrides.filter((o) => o.date !== a.date) })
    case 'overrides': {
      const map = new Map(state.overrides.map((o) => [o.date, o]))
      for (const o of a.overrides) map.set(o.date, o)
      return stamp({ ...state, overrides: [...map.values()].sort((x, y) => (x.date < y.date ? -1 : 1)) })
    }
    case 'log': {
      const logs = [...state.logs.filter((l) => l.sessionId !== a.log.sessionId), { ...a.log, loggedAt: new Date().toISOString() }]
      let strength = state.strength
      if (a.log.sets?.length && a.log.status !== 'skipped') strength = applySessionResults(strength, a.log.date, a.log.sets, latestTest(state))
      return stamp({ ...state, logs, strength })
    }
    case 'removeLog':
      return stamp({ ...state, logs: state.logs.filter((l) => l.sessionId !== a.sessionId) })
    case 'test': {
      const tests = [...state.strengthTests.filter((t) => t.date !== a.test.date), a.test]
      return stamp({ ...state, strengthTests: tests, strength: applyStrengthTest(state.strength, a.test) })
    }
    case 'manual':
      return stamp({ ...state, manual: [...state.manual.filter((m) => m.date !== a.entry.date), a.entry] })
    case 'decision':
      return stamp({ ...state, decisions: [...state.decisions.filter((d) => d.sessionId !== a.decision.sessionId), a.decision] })
    case 'assignWorkout':
      return stamp({ ...state, workoutAssignments: { ...state.workoutAssignments, [a.workoutId]: a.sessionId } })
    case 'checklist':
      return stamp({ ...state, checklist: { ...state.checklist, [a.key]: a.value } })
    case 'demo':
      return stamp({ ...state, demoMode: a.value })
  }
}

/** Datum für die Anzeige: heute (Berlin) oder per ?date=YYYY-MM-DD überschrieben (Test/Screenshots) */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => overrideDate() ?? todayBerlin())
  useEffect(() => {
    if (overrideDate()) return
    const id = setInterval(() => setToday(todayBerlin()), 60_000)
    return () => clearInterval(id)
  }, [])
  return today
}

function overrideDate(): ISODate | null {
  if (typeof location === 'undefined') return null
  const d = new URLSearchParams(location.search).get('date') ?? sessionStorage.getItem('ehrwald-trainer:date')
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    sessionStorage.setItem('ehrwald-trainer:date', d)
    return d
  }
  return null
}

interface StoreValue {
  state: AppState
  dispatch: (a: Action) => void
  engine: Engine
  today: ISODate
  whoop: WhoopData | null
  whoopSource: 'whoop' | 'demo' | null
  setWhoop: (d: WhoopData | null) => void
  refreshWhoop: (force?: boolean) => Promise<string>
  syncStatus: string
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, loadLocal)
  const [whoopReal, setWhoopReal] = useState<WhoopData | null>(() => loadWhoopCache())
  const [syncStatus, setSyncStatus] = useState('lokal')
  const today = useToday()
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const dispatch = useCallback((a: Action) => rawDispatch(a), [])

  useEffect(() => {
    saveLocal(state)
    remote.push(state).then((s) => s && setSyncStatus(s))
  }, [state])

  // Beim Start: Remote-Zustand laden (falls eingeloggt) und WHOOP-Daten holen
  useEffect(() => {
    let alive = true
    remote.init((status) => alive && setSyncStatus(status)).then(async (remoteState) => {
      if (!alive) return
      if (remoteState && remoteState.updatedAt > stateRef.current.updatedAt) rawDispatch({ type: 'replace', state: normalizeState(remoteState) })
      else remote.push(stateRef.current).then((st) => alive && st && setSyncStatus(st)) // Umzug bzw. lokale Änderungen nachreichen
      let w = await remote.fetchWhoop()
      if (alive && w) {
        setWhoopReal(w)
        saveWhoopCache(w)
      }
      // Fallback zum Webhook: Abruf beim Öffnen der App (Edge Function drosselt auf 15 min)
      const r = await syncWhoop()
      if (alive && r.ok && !r.skipped) {
        w = await remote.fetchWhoop()
        if (w) {
          setWhoopReal(w)
          saveWhoopCache(w)
        }
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const setWhoop = useCallback((d: WhoopData | null) => {
    setWhoopReal(d)
    saveWhoopCache(d)
  }, [])
  const refreshWhoop = useCallback(async (force = true) => {
    const r = await syncWhoop({ force })
    const w = await remote.fetchWhoop()
    setWhoop(w)
    return r.ok ? 'WHOOP-Daten aktualisiert.' : `WHOOP: ${r.error ?? 'Fehler'}`
  }, [setWhoop])

  const demo = useMemo(
    () => (state.demoMode ? sampleWhoop(state.settings, state.overrides, addDays(state.settings.shift.planStart, -40), today) : null),
    [state.demoMode, state.settings, state.overrides, today],
  )
  const whoop = whoopReal ?? demo
  const whoopSource = whoopReal ? 'whoop' : demo ? 'demo' : null

  const engine = useMemo(
    () =>
      buildEngine({
        settings: state.settings,
        overrides: state.overrides,
        strength: state.strength,
        logs: state.logs,
        manual: state.manual,
        whoop,
        today,
      }),
    [state.settings, state.overrides, state.strength, state.logs, state.manual, whoop, today],
  )

  // WHOOP-Workouts automatisch geplanten Einheiten zuordnen und als Ist-Werte übernehmen
  useEffect(() => {
    if (!whoopReal?.workouts.length) return
    const matches = matchWorkouts(engine.plan.days, whoopReal.workouts, state.workoutAssignments)
    for (const [wid, sid] of matches) {
      if (state.logs.some((l) => l.sessionId === sid || l.whoopWorkoutId === wid)) continue
      const w = whoopReal.workouts.find((x) => x.id === wid)
      const pd = engine.plan.days.find((d) => d.sessions.some((x) => x.id === sid))
      if (!w || !pd) continue
      const a = workoutActuals(w)
      rawDispatch({ type: 'log', log: { sessionId: sid, date: pd.date, status: 'done', durationMin: a.durationMin, distanceKm: a.distanceKm, elevationM: a.elevationM, avgHr: a.avgHr, strain: a.strain, whoopWorkoutId: wid, notes: 'automatisch aus WHOOP übernommen' } })
    }
  }, [whoopReal, engine, state.logs, state.workoutAssignments])

  // Erinnerungen bei Plan-/Erholungsänderungen neu hinterlegen (entprellt)
  const notif = state.settings.notifications
  useEffect(() => {
    if (!notif.bedtime && !notif.nap) return
    const t = setTimeout(() => syncReminders(engine, today, notif).catch((e) => console.warn(e)), 3000)
    return () => clearTimeout(t)
  }, [engine, today, notif])

  const value = useMemo(() => ({ state, dispatch, engine, today, whoop, whoopSource: whoopSource as StoreValue['whoopSource'], setWhoop, refreshWhoop, syncStatus }), [state, dispatch, engine, today, whoop, whoopSource, setWhoop, refreshWhoop, syncStatus])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider fehlt')
  return v
}

export { initialState }
