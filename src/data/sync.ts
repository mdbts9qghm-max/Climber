/**
 * Synchronisation mit Supabase (Phase 4). Local-first: Der lokale Zustand ist immer
 * nutzbar, Änderungen werden entprellt als Upserts/Deletes in die normalisierten Tabellen
 * geschrieben. Beim Start wird der Remote-Zustand geladen, wenn er neuer ist.
 */
import type { WhoopCycle, WhoopData, WhoopRecovery, WhoopSleep, WhoopWorkout } from '../core'
import { normalizeState, type AppState } from './state'
import { supabase } from './supabase'

export interface Remote {
  init(onStatus: (s: string) => void): Promise<AppState | null>
  push(s: AppState): Promise<string | null>
  fetchWhoop(): Promise<WhoopData | null>
}

type Row = Record<string, unknown>
interface TableSpec {
  table: string
  key: string[]
  rows: (s: AppState, uid: string) => Row[]
}

const TABLES: TableSpec[] = [
  {
    table: 'profiles',
    key: ['user_id'],
    rows: (s, uid) => [{ user_id: uid, settings: s.settings, onboarded: s.onboarded, demo_mode: s.demoMode, checklist: s.checklist, workout_assignments: s.workoutAssignments, updated_at: s.updatedAt }],
  },
  {
    table: 'day_overrides',
    key: ['user_id', 'date'],
    rows: (s, uid) => s.overrides.map((o) => ({ user_id: uid, date: o.date, type: o.type, shift: o.shift ?? null, start_time: o.start ?? null, end_time: o.end ?? null, note: o.note ?? null })),
  },
  { table: 'session_logs', key: ['user_id', 'session_id'], rows: (s, uid) => s.logs.map((l) => ({ user_id: uid, session_id: l.sessionId, date: l.date, status: l.status, data: l })) },
  { table: 'strength_tests', key: ['user_id', 'date'], rows: (s, uid) => s.strengthTests.map((t) => ({ user_id: uid, date: t.date, data: t })) },
  { table: 'strength_progress', key: ['user_id'], rows: (s, uid) => [{ user_id: uid, state: s.strength }] },
  {
    table: 'manual_recovery',
    key: ['user_id', 'date'],
    rows: (s, uid) => s.manual.map((m) => ({ user_id: uid, date: m.date, sleep_hours: m.sleepHours, sleep_quality: m.sleepQuality, feeling: m.feeling })),
  },
  { table: 'adjustment_decisions', key: ['user_id', 'session_id'], rows: (s, uid) => s.decisions.map((d) => ({ user_id: uid, session_id: d.sessionId, date: d.date, accepted: d.accepted, data: d })) },
]

const keyOf = (spec: TableSpec, r: Row) => spec.key.map((k) => String(r[k])).join('|')

/** zuletzt synchronisierter Stand je Tabelle: key → JSON */
let lastPushed: Map<string, Map<string, string>> | null = null
let uid: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let pending: AppState | null = null

function snapshot(s: AppState, user: string) {
  const m = new Map<string, Map<string, string>>()
  for (const spec of TABLES) m.set(spec.table, new Map(spec.rows(s, user).map((r) => [keyOf(spec, r), JSON.stringify(r)])))
  return m
}

async function flush(): Promise<string> {
  if (!supabase || !uid || !pending || !lastPushed) return 'lokal'
  const s = pending
  pending = null
  const next = snapshot(s, uid)
  try {
    for (const spec of TABLES) {
      const before = lastPushed.get(spec.table)!
      const after = next.get(spec.table)!
      const upserts = [...after.entries()].filter(([k, v]) => before.get(k) !== v).map(([, v]) => JSON.parse(v))
      const deletes = [...before.keys()].filter((k) => !after.has(k))
      if (upserts.length) {
        const { error } = await supabase.from(spec.table).upsert(upserts, { onConflict: spec.key.join(',') })
        if (error) throw error
      }
      for (const k of deletes) {
        const parts = k.split('|')
        let q = supabase.from(spec.table).delete()
        spec.key.forEach((col, i) => (q = q.eq(col, parts[i])))
        const { error } = await q
        if (error) throw error
      }
    }
    lastPushed = next
    return `synchronisiert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  } catch (e) {
    pending = pending ?? s
    console.warn('Sync fehlgeschlagen', e)
    return 'Sync-Fehler – Daten sind lokal gespeichert'
  }
}

async function loadRemote(user: string): Promise<AppState | null> {
  const sb = supabase!
  const [p, ov, logs, tests, prog, man, dec] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', user).maybeSingle(),
    sb.from('day_overrides').select('*'),
    sb.from('session_logs').select('data'),
    sb.from('strength_tests').select('data'),
    sb.from('strength_progress').select('state').maybeSingle(),
    sb.from('manual_recovery').select('*'),
    sb.from('adjustment_decisions').select('data'),
  ])
  if (p.error) throw p.error
  if (!p.data) return null
  return normalizeState({
    onboarded: p.data.onboarded,
    settings: p.data.settings,
    demoMode: p.data.demo_mode,
    checklist: p.data.checklist,
    workoutAssignments: p.data.workout_assignments,
    updatedAt: p.data.updated_at,
    overrides: (ov.data ?? []).map((o) => ({ date: o.date, type: o.type, shift: o.shift ?? undefined, start: o.start_time ?? undefined, end: o.end_time ?? undefined, note: o.note ?? undefined })),
    logs: (logs.data ?? []).map((r) => r.data),
    strengthTests: (tests.data ?? []).map((r) => r.data),
    strength: prog.data?.state,
    manual: (man.data ?? []).map((m) => ({ date: m.date, sleepHours: Number(m.sleep_hours), sleepQuality: m.sleep_quality, feeling: m.feeling })),
    decisions: (dec.data ?? []).map((r) => r.data),
  })
}

export const remote: Remote = {
  async init(onStatus) {
    if (!supabase) {
      onStatus('lokal (Supabase nicht konfiguriert)')
      return null
    }
    const { data } = await supabase.auth.getSession()
    uid = data.session?.user.id ?? null
    if (!uid) {
      onStatus('lokal (nicht angemeldet)')
      return null
    }
    try {
      const st = await loadRemote(uid)
      // Basis für Diffs: der Remote-Stand (leer, wenn noch nichts hochgeladen wurde → Umzug lädt alles hoch)
      lastPushed = st ? snapshot(st, uid) : new Map(TABLES.map((t) => [t.table, new Map()]))
      onStatus(st ? 'synchronisiert' : 'angemeldet – lokale Daten werden hochgeladen')
      return st
    } catch (e) {
      console.warn(e)
      onStatus('offline – lokale Daten')
      lastPushed = null
      return null
    }
  },
  async push(s) {
    if (!supabase || !uid || !lastPushed) return null
    pending = s
    if (timer) clearTimeout(timer)
    return new Promise((resolve) => {
      timer = setTimeout(async () => resolve(await flush()), 1200)
    })
  },
  async fetchWhoop() {
    if (!supabase || !uid) return null
    const [c, r, s, w, b] = await Promise.all([
      supabase.from('whoop_cycles').select('raw').order('start_at'),
      supabase.from('whoop_recoveries').select('raw'),
      supabase.from('whoop_sleeps').select('raw').order('start_at'),
      supabase.from('whoop_workouts').select('raw').order('start_at'),
      supabase.from('whoop_body').select('raw').maybeSingle(),
    ])
    if (c.error || !c.data?.length) return null
    return {
      cycles: c.data.map((x) => x.raw as WhoopCycle),
      recoveries: (r.data ?? []).map((x) => x.raw as WhoopRecovery),
      sleeps: (s.data ?? []).map((x) => x.raw as WhoopSleep),
      workouts: (w.data ?? []).map((x) => x.raw as WhoopWorkout),
      maxHr: (b.data?.raw as { max_heart_rate?: number } | undefined)?.max_heart_rate ?? null,
    }
  },
}

/** Für den "Umzug": kompletten lokalen Stand sofort hochladen */
export async function uploadAll(s: AppState): Promise<string> {
  if (!supabase || !uid) return 'Nicht angemeldet'
  lastPushed = new Map(TABLES.map((t) => [t.table, new Map()]))
  pending = s
  return flush()
}
