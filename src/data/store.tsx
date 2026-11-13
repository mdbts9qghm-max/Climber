/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import {
  addDays,
  applySessionResults,
  applyStrengthTest,
  buildEngine,
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
  syncStatus: string
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, loadLocal)
  const [whoopReal, setWhoopReal] = useState<WhoopData | null>(() => loadWhoopCache())
  const [syncStatus, setSyncStatus] = useState('lokal')
  const today = useToday()
  const stateRef = useRef(state)
  stateRef.current = state

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
      const w = await remote.fetchWhoop()
      if (alive && w) {
        setWhoopReal(w)
        saveWhoopCache(w)
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

  const value = useMemo(() => ({ state, dispatch, engine, today, whoop, whoopSource: whoopSource as StoreValue['whoopSource'], setWhoop, syncStatus }), [state, dispatch, engine, today, whoop, whoopSource, setWhoop, syncStatus])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider fehlt')
  return v
}

export { initialState }
