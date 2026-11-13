/**
 * Planerstellung (SPEC 5): Mikrozyklus-Vorlagen je Phase auf die Standardpositionen legen,
 * dann Verfügbarkeit (Schichten, Overrides) anwenden, Schlüsseleinheiten höchstens einmal
 * verschieben, sonst streichen. Nie etwas in andere Tage quetschen.
 */
import { NIGHT_RUNS, VOLUME, WINDOWS } from './config'
import { addDays, addMin, diffDays, toMin } from './dates'
import { resolveDays, windowMinutes } from './shifts'
import { buildSkeleton, microStyle, type Skeleton } from './skeleton'
import {
  HEAVY_LEG_TYPES,
  KEY_PRIORITY,
  LONG_TYPES,
  QUALITY_TYPES,
  b2bRun,
  caliMain,
  caliSkill,
  easyRun,
  hillIntervals,
  hillTreadmill,
  legs,
  longRun,
  mobility,
  mountainDay,
  race,
  recoveryRun,
  shakeout,
  strengthTest,
  threshold,
  type BuildCtx,
} from './sessions'
import { initialStrengthState } from './strength'
import type { DayOverride, ISODate, MicroInfo, Plan, PlanDay, ResolvedDay, Session, SessionLog, SessionType, Settings, StrengthState } from './types'

export interface PlanInput {
  settings: Settings
  overrides: DayOverride[]
  strength?: StrengthState
  logs?: SessionLog[]
  /** heutiges Datum: davor liegende, nicht erledigte Schlüsseleinheiten gelten als verpasst */
  today?: ISODate
  microFactors?: Record<number, number>
}

interface Slot {
  date: ISODate
  slot: string
  build: (ctx: BuildCtx) => Session
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Typen, die an einem Schlaftag (optional) erlaubt sind */
const SLEEP_DAY_OK: SessionType[] = ['RECOVERY_RUN', 'MOBILITY', 'CALI_SKILL', 'SHAKEOUT']

function restKm(m: MicroInfo, used: number): { tag2: number; tag5: number; regen: number } {
  const rest = Math.max(0, m.targetKm - used)
  const r = VOLUME.restShares
  return {
    tag2: clamp(rest * r.tag2, VOLUME.minEasyKm, VOLUME.maxEasyKm),
    tag5: clamp(rest * r.tag5, VOLUME.minEasyKm, VOLUME.maxEasyKm),
    regen: rest * r.regen,
  }
}

/** Vorlage für einen Mikrozyklus. `pos[n]` = Datum von Zyklustag n (falls im Mikrozyklus). */
export function microTemplate(m: MicroInfo, pos: Partial<Record<1 | 2 | 3 | 4 | 5, ISODate>>, taperIndex: number): Slot[] {
  const out: Slot[] = []
  const add = (day: 1 | 2 | 3 | 4 | 5, slot: string, build: Slot['build']) => {
    const date = pos[day]
    if (date) out.push({ date, slot, build })
  }
  const style = microStyle(m)
  const long = m.longRunKm

  if (m.phase === 'intro') {
    add(3, 'mob', (c) => mobility(c, 20, true))
    add(4, 'test', (c) => strengthTest(c))
    add(4, 'run', (c) => easyRun(c, VOLUME.minEasyKm, { abc: true }))
    add(5, 'long', (c) => longRun(c, long))
    return out
  }

  if (m.phase === 'race') {
    add(2, 'run', (c) => shakeout(c, 30, 'Lockerer Lauf vor der Nachtschicht – nur Rhythmus halten.'))
    add(2, 'mob', (c) => mobility(c, 15))
    add(3, 'mob', (c) => mobility(c, 15, true))
    add(4, 'run', (c) => shakeout(c, 20, 'Kurz lockern am Anreisetag nach Ehrwald.'))
    add(5, 'race', (c) => race(c))
    return out
  }

  if (m.phase === 'taper') {
    const k = restKm(m, long)
    if (taperIndex === 0) {
      add(2, 'run', (c) => threshold(c, k.tag2))
      add(2, 'cali', (c) => caliMain(c, 'short'))
      add(2, 'legs', (c) => legs(c, 'maint'))
      if (k.regen >= VOLUME.minEasyKm) add(3, 'regen', (c) => recoveryRun(c, k.regen))
      add(4, 'long', (c) => longRun(c, long))
      add(5, 'run', (c) => easyRun(c, k.tag5))
      add(5, 'mob', (c) => mobility(c, 20))
    } else {
      add(2, 'run', (c) => easyRun(c, k.tag2, { abc: true }))
      add(2, 'cali', (c) => caliMain(c, 'short'))
      add(4, 'long', (c) => longRun(c, long))
      add(5, 'run', (c) => easyRun(c, k.tag5))
    }
    return out
  }

  if (m.isDeload) {
    const k = restKm(m, long)
    add(2, 'test', (c) => strengthTest(c))
    add(2, 'run', (c) => easyRun(c, k.tag2))
    add(3, 'mob', (c) => mobility(c, 20, true))
    add(4, 'long', (c) => longRun(c, long))
    add(5, 'run', (c) => easyRun(c, k.tag5, { abc: true }))
    add(5, 'legs', (c) => legs(c, 'maint'))
    return out
  }

  if (style === 'mountain') {
    const day2 = Math.round(m.targetKm * VOLUME.mountainShares.day2 * 10) / 10
    add(2, 'run', (c) => easyRun(c, VOLUME.minEasyKm + 2))
    add(2, 'cali', (c) => caliMain(c, 'maint'))
    add(3, 'mob', (c) => mobility(c, 20, true))
    add(4, 'long', (c) => mountainDay(c, long, 1))
    add(5, 'b2b', (c) => mountainDay(c, day2, 2))
    return out
  }

  const b2bKm = style === 'b2b' ? Math.round(m.targetKm * VOLUME.b2bShares.b2b * 10) / 10 : 0
  const k = restKm(m, long + b2bKm)
  const regen = (c: BuildCtx) => (k.regen >= VOLUME.minEasyKm ? recoveryRun(c, k.regen) : mobility(c, 20, true))

  if (m.phase === 'base') {
    add(2, 'legs', (c) => legs(c, 'heavy'))
    add(2, 'cali', (c) => caliMain(c, 'full'))
    add(3, 'regen', regen)
    add(3, 'skill', (c) => caliSkill(c))
    add(4, 'long', (c) => longRun(c, long))
    const longHm = Math.round(long * VOLUME.flatLongHmPerKm * 0.5)
    add(5, 'run', (c) => easyRun(c, k.tag2 + k.tag5, { abc: true, hm: Math.max(0, Math.round((m.targetHm - longHm) / 10) * 10) }))
    add(5, 'cali', (c) => caliMain(c, 'full'))
    return out
  }

  if (m.phase === 'build') {
    add(2, 'run', (c) => hillIntervals(c, k.tag2))
    add(2, 'legs', (c) => legs(c, 'eccentric'))
    add(3, 'regen', regen)
    add(4, 'long', (c) => longRun(c, long, m.hasNightRun ? { night: true, startTime: NIGHT_RUNS.start } : {}))
    if (style === 'b2b') {
      add(5, 'b2b', (c) => b2bRun(c, b2bKm))
      add(5, 'cali', (c) => caliMain(c, 'maint'))
    } else {
      add(5, 'run', (c) => hillTreadmill(c, k.tag5))
      add(5, 'cali', (c) => caliMain(c, 'full'))
    }
    return out
  }

  // Rennspezifisch
  if (style === 'b2b') add(2, 'run', (c) => hillIntervals(c, k.tag2))
  else add(2, 'run', (c) => threshold(c, k.tag2))
  add(2, 'legs', (c) => legs(c, 'maint'))
  add(2, 'cali', (c) => caliMain(c, 'maint'))
  add(3, 'regen', regen)
  add(4, 'long', (c) => longRun(c, long, m.hasNightRun ? { night: true, startTime: NIGHT_RUNS.start } : {}))
  if (style === 'b2b') add(5, 'b2b', (c) => b2bRun(c, b2bKm))
  else add(5, 'run', (c) => hillTreadmill(c, k.tag5))
  return out
}

// ───────────── Verfügbarkeit ─────────────

function allowedOn(day: ResolvedDay, s: Session): boolean {
  if (day.availability === 'none') return false
  if (s.type === 'RACE') return true
  if (day.availability === 'optional') return SLEEP_DAY_OK.includes(s.type)
  if (day.availability === 'limited') {
    if (s.type === 'NIGHT_RUN' || s.type === 'MOUNTAIN_DAY' || s.type === 'B2B_RUN') return false
    return s.durationMin <= windowMinutes(day.window)
  }
  return true
}

function unavailableReason(day: ResolvedDay): string {
  switch (day.kind) {
    case 'DAY_SHIFT':
      return 'Tagschicht – kein Training'
    case 'V_SHIFT':
      return 'V-Schicht – kein Training'
    case 'SICK':
      return 'Krank – Pause hat Vorrang'
    case 'CUSTOM_WORK':
      return 'Dienst/Fortbildung – kein Training'
    case 'SLEEP_DAY':
      return 'Schlaftag – nur lockere Einheiten'
    case 'NIGHT_SHIFT':
      return 'Passt nicht ins Zeitfenster vor der Nachtschicht'
    default:
      return 'Nicht verfügbar'
  }
}

const prio = (s: Session) => KEY_PRIORITY[s.type] ?? 0

function dayBlocksMove(target: PlanDay, s: Session): boolean {
  return target.sessions.some((x) => x.key && prio(x) >= prio(s))
}

function heavyLegsDayBefore(days: Map<ISODate, PlanDay>, date: ISODate): boolean {
  const prev = days.get(addDays(date, -1))
  return !!prev?.sessions.some((x) => HEAVY_LEG_TYPES.includes(x.type))
}

/**
 * Verschiebt eine Schlüsseleinheit einmal auf den nächsten passenden freien Tag.
 * Auf dem Zieltag ersetzt sie niedrigere Schlüsseleinheiten und Nicht-Schlüssel-Läufe.
 */
function tryMove(
  days: Map<ISODate, PlanDay>,
  s: Session,
  from: ISODate,
  earliest: ISODate,
  latest: ISODate,
  replaceKeys: boolean,
  dryRun = false,
): ISODate | null {
  if (s.type === 'B2B_RUN' || s.type === 'RACE') return null
  for (let d = earliest; d <= latest; d = addDays(d, 1)) {
    const target = days.get(d)
    if (!target || d === from) continue
    if (target.day.availability !== 'full') continue
    if (target.phase === 'race') continue
    if (replaceKeys ? dayBlocksMove(target, s) : target.sessions.some((x) => x.key)) continue
    if (LONG_TYPES.includes(s.type) && heavyLegsDayBefore(days, d)) continue
    if (dryRun) return d
    const moved: Session = { ...s, date: d, movedFrom: from }
    if (s.type === 'NIGHT_RUN' && !target.day.nightRunAllowed) {
      moved.type = 'LONG_RUN'
      moved.timeOfDay = 'morning'
      moved.startTime = undefined
    }
    // Ersetzen statt dazupacken (kein Nachholen von Umfang)
    const keep: Session[] = []
    for (const x of target.sessions) {
      const replace = (x.key && prio(x) < prio(s)) || (moved.category === 'run' && x.category === 'run' && !x.key)
      if (replace) target.dropped.push({ session: x, reason: `Ersetzt durch verschobene Einheit „${s.title}“` })
      else keep.push(x)
    }
    // B2B am Folgetag braucht den langen Lauf davor – bleibt gültig, wenn wir einen langen Lauf bringen
    target.sessions = [...keep, moved]
    return d
  }
  return null
}

function fitWindow(pd: PlanDay) {
  const w = pd.day.window
  if (!w || pd.sessions.length === 0) return
  const cap = windowMinutes(w)
  // Nachtlauf läuft außerhalb des normalen Fensters
  const inWindow = pd.sessions.filter((s) => s.type !== 'NIGHT_RUN' && s.type !== 'RACE')
  const gap = 20
  const total = () => inWindow.reduce((a, s) => a + s.durationMin, 0) + gap * Math.max(0, inWindow.length - 1)
  while (total() > cap && inWindow.length > 1) {
    // niedrigste Priorität zuerst: optional → nicht-Schlüssel Kraft → nicht-Schlüssel Lauf
    const order = [...inWindow].sort((a, b) => score(a) - score(b))
    const victim = order[0]
    inWindow.splice(inWindow.indexOf(victim), 1)
    pd.sessions = pd.sessions.filter((s) => s !== victim)
    pd.dropped.push({ session: victim, reason: 'Passt nicht ins Zeitfenster' })
  }
  let t = toMin(w.start) + (pd.day.kind === 'FREE' || pd.day.kind === 'VACATION' ? 60 : 0)
  if (pd.day.kind === 'SLEEP_DAY') t = toMin(w.start) + 30
  // Startzeit so wählen, dass alles vor Fensterende fertig ist
  t = Math.min(t, toMin(w.end) - total())
  t = Math.max(t, toMin(w.start))
  for (const s of inWindow) {
    if (!s.startTime) s.startTime = addMin('00:00', t)
    t += s.durationMin + gap
  }
  function score(s: Session) {
    return (s.optional ? 0 : 10) + (s.key ? 100 : 0) + (s.category === 'run' ? 5 : 0)
  }
}

// ───────────── Hauptfunktion ─────────────

export function generatePlan(input: PlanInput): Plan {
  const s = input.settings
  const strength = input.strength ?? initialStrengthState()
  const sk: Skeleton = buildSkeleton(s, input.microFactors)
  const resolved = resolveDays(sk.start, sk.end, input.overrides, s)
  const byDate = new Map<ISODate, PlanDay>()
  const microOf = (d: ISODate) => sk.micros.find((m) => m.start <= d && d <= m.end)!
  for (const day of resolved) {
    const m = microOf(day.date)
    byDate.set(day.date, {
      date: day.date,
      day,
      sessions: [],
      dropped: [],
      microIndex: m.index,
      mesoIndex: m.mesoIndex,
      phase: m.phase,
      isDeload: m.isDeload,
      notes: [],
    })
  }

  // 1. Vorlagen auf Standardpositionen
  let taperIdx = 0
  const planned: { slot: Slot; session: Session }[] = []
  for (const m of sk.micros) {
    const pos: Partial<Record<1 | 2 | 3 | 4 | 5, ISODate>> = {}
    for (let d = m.start; d <= m.end; d = addDays(d, 1)) pos[byDate.get(d)!.day.cycleDay] = d
    const slots = microTemplate(m, pos, m.phase === 'taper' ? taperIdx : 0)
    if (m.phase === 'taper') taperIdx++
    for (const slot of slots) {
      const pd = byDate.get(slot.date)!
      const session = slot.build({ date: slot.date, slot: slot.slot, phase: m.phase, settings: s, strength })
      planned.push({ slot, session })
      void pd
    }
  }

  // 2. Verfügbarkeit anwenden (in Datumsreihenfolge)
  planned.sort((a, b) => (a.slot.date < b.slot.date ? -1 : a.slot.date > b.slot.date ? 1 : 0))
  const pending: Session[] = []
  for (const { session } of planned) {
    const pd = byDate.get(session.date)!
    let sess = session
    if (sess.type === 'NIGHT_RUN' && !pd.day.nightRunAllowed && pd.day.availability === 'full') {
      sess = { ...sess, type: 'LONG_RUN', timeOfDay: 'morning', startTime: undefined, notes: [...(sess.notes ?? []), 'Nachtlauf nicht möglich (Folgetag nicht frei) – als normaler langer Lauf'] }
    }
    if (allowedOn(pd.day, sess)) pd.sessions.push(sess)
    else pending.push(sess)
  }
  for (const sess of pending) {
    const pd = byDate.get(sess.date)!
    const reason = unavailableReason(pd.day)
    if (sess.key) {
      const latest = addDays(sess.date, 5)
      const to = tryMove(byDate, sess, sess.date, addDays(sess.date, 1), latest < sk.end ? latest : sk.end, true)
      if (to) {
        pd.dropped.push({ session: sess, reason: `${reason} → verschoben auf ${to}` })
        continue
      }
    }
    pd.dropped.push({ session: sess, reason: sess.key ? `${reason} – kein passender Ersatztag, gestrichen` : `${reason} – gestrichen` })
  }

  // B2B ohne langen Lauf am Vortag ist sinnlos → streichen
  for (const pd of byDate.values()) {
    const b2b = pd.sessions.find((x) => x.type === 'B2B_RUN')
    if (!b2b) continue
    const prev = byDate.get(addDays(pd.date, -1))
    const ok = prev?.sessions.some((x) => ['LONG_RUN', 'NIGHT_RUN', 'MOUNTAIN_DAY'].includes(x.type))
    if (!ok && !(b2b.type === 'B2B_RUN' && pd.sessions.some((x) => x.type === 'MOUNTAIN_DAY'))) {
      pd.sessions = pd.sessions.filter((x) => x !== b2b)
      pd.dropped.push({ session: b2b, reason: 'Back-to-back ohne langen Lauf am Vortag – gestrichen' })
    }
  }

  // 3. Verpasste Schlüsseleinheiten (einmal verschieben, sonst streichen)
  if (input.today) {
    const today = input.today
    const done = new Set((input.logs ?? []).filter((l) => l.status === 'done' || l.status === 'partial').map((l) => l.sessionId))
    const skipped = new Set((input.logs ?? []).filter((l) => l.status === 'skipped').map((l) => l.sessionId))
    for (const pd of [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      if (pd.date >= today && !pd.sessions.some((x) => skipped.has(x.id))) continue
      for (const sess of [...pd.sessions]) {
        if (!sess.key || done.has(sess.id)) continue
        const missed = pd.date < today || skipped.has(sess.id)
        if (!missed) continue
        if (sess.movedFrom) {
          pd.dropped.push({ session: sess, reason: 'Verpasst (bereits einmal verschoben) – gestrichen, kein Nachholen' })
          pd.sessions = pd.sessions.filter((x) => x !== sess)
          continue
        }
        // Ersatztag so bestimmen, wie er am Tag nach dem Verpassen bestimmt worden wäre
        const latest = addDays(pd.date, 6)
        const lim = latest < sk.end ? latest : sk.end
        const candidate = tryMove(byDate, sess, pd.date, addDays(pd.date, 1), lim, false, true)
        let to: ISODate | null = null
        let reason = 'Verpasst – kein passender Tag 4/5 frei, gestrichen (kein Nachholen von Umfang)'
        if (candidate && (candidate >= today || done.has(sess.id))) to = tryMove(byDate, sess, pd.date, addDays(pd.date, 1), lim, false)
        else if (candidate) reason = `Verpasst, auch am Ersatztag ${candidate} nicht erledigt – gestrichen`
        pd.sessions = pd.sessions.filter((x) => x !== sess)
        pd.dropped.push({ session: sess, reason: to ? `Verpasst → einmal verschoben auf ${to}` : reason })
      }
    }
  }

  // 4. Schweres Beintraining nie am Vortag von langem Lauf, Qualität oder Rennen
  for (const pd of byDate.values()) {
    const next = byDate.get(addDays(pd.date, 1))
    const conflict = !!next?.sessions.some((x) => LONG_TYPES.includes(x.type) || QUALITY_TYPES.includes(x.type) || x.type === 'RACE') || addDays(pd.date, 1) === s.shift.raceDate
    if (!conflict) continue
    for (const leg of pd.sessions.filter((x) => HEAVY_LEG_TYPES.includes(x.type))) {
      pd.sessions = pd.sessions.filter((x) => x !== leg)
      pd.dropped.push({ session: leg, reason: 'Kein schweres Beintraining am Vortag eines langen Laufs/einer Qualitätseinheit' })
    }
  }

  // 5. Zeitfenster, Hinweise
  for (const pd of byDate.values()) {
    fitWindow(pd)
    if (pd.day.kind === 'DAY_SHIFT') pd.notes.push(`Ruhetag – optional ${WINDOWS.dayShiftMobilityMin} min Mobility am Abend`)
    if (pd.day.kind === 'V_SHIFT') pd.notes.push('V-Schicht – Ruhetag')
    if (pd.day.kind === 'SICK') pd.notes.push('Krank: Pause hat Vorrang. Bei anhaltenden Beschwerden ärztlich abklären lassen.')
    if ((pd.phase === 'taper' || pd.phase === 'race') && pd.day.kind === 'NIGHT_SHIFT')
      pd.notes.push('Nachtschicht im Taper: Einheit kurz halten, Nap und Schlaf danach haben Vorrang.')
    if ((pd.phase === 'taper' || pd.phase === 'race') && pd.day.kind === 'DAY_SHIFT') pd.notes.push('Tagschicht im Taper: früh schlafen gehen, Schlafbank für das Rennen füllen.')
  }

  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const plan: Plan = { days, micros: sk.micros, mesos: sk.mesos, byDate: Object.fromEntries(days.map((d) => [d.date, d])) }
  return plan
}

// ───────────── Regelprüfung ─────────────

export interface Violation {
  date: ISODate
  rule: string
}

export function validatePlan(plan: Plan): Violation[] {
  const v: Violation[] = []
  for (const pd of plan.days) {
    const k = pd.day.kind
    if ((k === 'DAY_SHIFT' || k === 'V_SHIFT' || k === 'SICK' || k === 'CUSTOM_WORK') && pd.sessions.length) v.push({ date: pd.date, rule: `Einheit an ${pd.day.label}` })
    if (k === 'SLEEP_DAY' && pd.sessions.some((s) => !SLEEP_DAY_OK.includes(s.type))) v.push({ date: pd.date, rule: 'Harte Einheit am Schlaftag' })
    if (k === 'NIGHT_SHIFT') {
      const total = pd.sessions.reduce((a, s) => a + s.durationMin, 0)
      if (total > windowMinutes(pd.day.window)) v.push({ date: pd.date, rule: 'Zeitfenster vor der Nachtschicht überschritten' })
      for (const s of pd.sessions) {
        if (s.startTime && pd.day.window && toMin(s.startTime) + s.durationMin > toMin(pd.day.window.end))
          v.push({ date: pd.date, rule: `${s.title} endet nach ${pd.day.window.end}` })
      }
    }
    const next = plan.byDate[addDays(pd.date, 1)]
    if (pd.sessions.some((s) => HEAVY_LEG_TYPES.includes(s.type))) {
      if (next?.sessions.some((s) => LONG_TYPES.includes(s.type) || QUALITY_TYPES.includes(s.type) || s.type === 'RACE'))
        v.push({ date: pd.date, rule: 'Schweres Beintraining am Vortag eines langen Laufs/einer Qualitätseinheit' })
    }
    for (const s of pd.sessions) if (LONG_TYPES.includes(s.type) && s.type !== 'B2B_RUN' && pd.day.availability !== 'full') v.push({ date: pd.date, rule: 'Langer Lauf nicht an einem freien Tag' })
  }
  return v
}

/** Summen pro Mikrozyklus (geplant) */
export function microTotals(plan: Plan, microIndex: number): { km: number; hm: number; strength: number; minutes: number } {
  let km = 0
  let hm = 0
  let strength = 0
  let minutes = 0
  for (const pd of plan.days) {
    if (pd.microIndex !== microIndex) continue
    for (const s of pd.sessions) {
      if (s.type === 'RACE') continue
      km += s.distanceKm ?? 0
      hm += s.elevationM ?? 0
      minutes += s.durationMin
      if (s.category === 'strength') strength++
    }
  }
  return { km: Math.round(km * 10) / 10, hm: Math.round(hm), strength, minutes }
}

export function findSession(plan: Plan, id: string): Session | undefined {
  for (const pd of plan.days) {
    const s = pd.sessions.find((x) => x.id === id)
    if (s) return s
  }
  return undefined
}

export function daysUntil(from: ISODate, to: ISODate): number {
  return diffDays(from, to)
}
