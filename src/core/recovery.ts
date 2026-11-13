/**
 * Schlaf und Erholung als Faktor jeder Einheit (SPEC 6).
 * Readiness, Ampel, Anpassungsregeln, Vorausschau, Warnsignal, Mikrozyklus-Reduktion.
 */
import { RECOVERY, RECOVERY_ZONES, SLEEP_DEFAULTS, type RecoveryWeights } from './config'
import { addDays, toMin } from './dates'
import { KEY_TYPES, legsTechnical, mobility, toEasyRun, TYPE_LABEL } from './sessions'
import { initialStrengthState } from './strength'
import type { Color, ISODate, MicroInfo, PlanDay, RecoveryDay, ResolvedDay, Session, SessionType, Settings } from './types'

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const fmt1 = (x: number) => x.toFixed(1).replace('.', ',')

export function colorOf(score: number): Color {
  return score >= RECOVERY_ZONES.green ? 'green' : score >= RECOVERY_ZONES.yellow ? 'yellow' : 'red'
}

export const COLOR_LABEL: Record<Color, string> = { green: 'Grün', yellow: 'Gelb', red: 'Rot' }

/** Manuelle Eingabe → Pseudo-Score 0–100 */
export function manualScore(sleepHours: number, quality: number, feeling: number, needH: number = SLEEP_DEFAULTS.defaultNeedH): number {
  return Math.round(clamp(((quality - 1) / 4) * 40 + ((feeling - 1) / 4) * 40 + Math.min(1, sleepHours / needH) * 20))
}

export interface Baselines {
  hrv7?: number
  hrv30?: number
  rhr30?: number
}

export function baselines(history: RecoveryDay[], date: ISODate): Baselines {
  const before = history.filter((h) => h.date < date)
  const last = (n: number) => before.filter((h) => h.date >= addDays(date, -n))
  const hrv = (xs: RecoveryDay[]) => mean(xs.map((x) => x.hrv).filter((x): x is number => x !== undefined))
  const rhr = (xs: RecoveryDay[]) => mean(xs.map((x) => x.rhr).filter((x): x is number => x !== undefined))
  const b: Baselines = {}
  const h7 = hrv(last(7))
  const h30 = hrv(last(30))
  const r30 = rhr(last(30))
  if (!Number.isNaN(h7)) b.hrv7 = h7
  if (!Number.isNaN(h30)) b.hrv30 = h30
  if (!Number.isNaN(r30)) b.rhr30 = r30
  return b
}

export interface Assessment {
  date: ISODate
  hasData: boolean
  source: 'whoop' | 'manual' | null
  color: Color | null
  score: number | null
  readiness: number | null
  components: Partial<Record<keyof RecoveryWeights, number>>
  sleepHours: number | null
  sleepDebtH: number | null
  triggers: string[]
  warning: string | null
  lastNightWork: boolean
}

export interface AssessInput {
  date: ISODate
  day: ResolvedDay
  prevDay?: ResolvedDay
  today?: RecoveryDay
  history: RecoveryDay[]
  weights: RecoveryWeights
  /** Minuten seit Mitternacht des geplanten Trainingsbeginns (für Schichtkontext) */
  trainingStartMin?: number
}

export function assess(input: AssessInput): Assessment {
  const { today: r, history, weights, day, prevDay } = input
  const lastNightWork = prevDay?.kind === 'NIGHT_SHIFT'
  const base: Assessment = {
    date: input.date,
    hasData: false,
    source: null,
    color: null,
    score: null,
    readiness: null,
    components: {},
    sleepHours: null,
    sleepDebtH: null,
    triggers: [],
    warning: null,
    lastNightWork,
  }
  if (!r) return { ...base, warning: warningSignal(history, input.date) }
  const needH = r.sleepNeedH ?? SLEEP_DEFAULTS.defaultNeedH
  const sleepHours = r.manual ? r.manual.sleepHours : (r.sleepHours ?? null)
  const score = r.source === 'whoop' && r.recoveryScore !== undefined ? r.recoveryScore : r.manual ? manualScore(r.manual.sleepHours, r.manual.sleepQuality, r.manual.feeling, needH) : null
  const comp: Assessment['components'] = {}
  if (score !== null) comp.recovery = score
  const b = baselines(history, input.date)
  if (r.hrv !== undefined && b.hrv30) comp.hrv = clamp(50 + (((r.hrv - b.hrv30) / b.hrv30) * 100 * 50) / RECOVERY.hrvRangePct)
  if (r.rhr !== undefined && b.rhr30) comp.rhr = clamp(50 - ((r.rhr - b.rhr30) * 50) / RECOVERY.rhrRangeBpm)
  if (sleepHours !== null) {
    const dur = clamp((sleepHours / needH) * 100)
    const perfParts = [r.sleepPerformance, r.sleepEfficiency].filter((x): x is number => x !== undefined)
    const perf = perfParts.length ? mean(perfParts) : r.manual ? ((r.manual.sleepQuality - 1) / 4) * 100 : dur
    const debt = r.sleepDebtH !== undefined ? clamp(100 - (r.sleepDebtH / RECOVERY.maxDebtH) * 100) : dur
    comp.sleep = 0.5 * dur + 0.3 * perf + 0.2 * debt
  }
  if (r.strainPrevDay !== undefined) comp.load = clamp(100 - clamp((r.strainPrevDay - RECOVERY.strainHighFrom) / (21 - RECOVERY.strainHighFrom), 0, 1) * 60)
  {
    let shift = 100
    if (lastNightWork) {
      shift -= 20
      if (input.trainingStartMin !== undefined) {
        const hoursSinceEnd = (input.trainingStartMin - toMin('07:00')) / 60
        if (hoursSinceEnd < RECOVERY.hoursSinceShiftLow) shift -= (1 - hoursSinceEnd / RECOVERY.hoursSinceShiftLow) * 40
      }
    }
    if (day.kind === 'NIGHT_SHIFT') shift -= 10
    comp.shift = clamp(shift)
  }
  let wsum = 0
  let acc = 0
  for (const [k, v] of Object.entries(comp) as [keyof RecoveryWeights, number][]) {
    acc += v * weights[k]
    wsum += weights[k]
  }
  const readiness = wsum > 0 ? Math.round(acc / wsum) : null
  const color = score !== null ? colorOf(score) : readiness !== null ? colorOf(readiness) : null

  const triggers: string[] = []
  if (color === 'yellow') triggers.push('Recovery gelb')
  if (hrvFalling(history, r)) triggers.push(`HRV fällt seit ${RECOVERY.hrvTrendDays} Tagen`)
  if (debtRising(history, r)) triggers.push('Schlafdefizit wächst')

  return {
    ...base,
    hasData: true,
    source: r.source,
    color,
    score,
    readiness,
    components: comp,
    sleepHours,
    sleepDebtH: r.sleepDebtH ?? null,
    triggers,
    warning: warningSignal([...history.filter((h) => h.date < input.date), r], addDays(input.date, 1)),
  }
}

function lastN(history: RecoveryDay[], today: RecoveryDay, n: number): RecoveryDay[] {
  return [...history.filter((h) => h.date < today.date).slice(-(n - 1)), today]
}

export function hrvFalling(history: RecoveryDay[], today: RecoveryDay): boolean {
  const xs = lastN(history, today, RECOVERY.hrvTrendDays).map((x) => x.hrv)
  if (xs.length < RECOVERY.hrvTrendDays || xs.some((x) => x === undefined)) return false
  for (let i = 1; i < xs.length; i++) if (!(xs[i]! < xs[i - 1]!)) return false
  return true
}

export function debtRising(history: RecoveryDay[], today: RecoveryDay): boolean {
  const xs = lastN(history, today, RECOVERY.debtTrendDays).map((x) => x.sleepDebtH)
  if (xs.length < RECOVERY.debtTrendDays || xs.some((x) => x === undefined)) return false
  for (let i = 1; i < xs.length; i++) if (!(xs[i]! > xs[i - 1]!)) return false
  return true
}

/** Warnsignal: Ruhepuls mehrere Tage deutlich erhöht UND HRV deutlich unter dem Mittel */
export function warningSignal(history: RecoveryDay[], untilExclusive: ISODate): string | null {
  const w = RECOVERY.warning
  const recent = history.filter((h) => h.date < untilExclusive).slice(-w.rhrWindow)
  if (recent.length < w.rhrWindow) return null
  const b = baselines(history, recent[0].date)
  if (!b.rhr30 || !b.hrv30) return null
  const rhrHigh = recent.filter((h) => h.rhr !== undefined && h.rhr - b.rhr30! >= w.rhrDeltaBpm).length
  const hrvLow = recent.filter((h) => h.hrv !== undefined && h.hrv <= b.hrv30! * (1 - w.hrvDropPct / 100)).length
  if (rhrHigh >= w.rhrDays && hrvLow >= w.hrvDays)
    return 'Ruhepuls seit mehreren Tagen deutlich erhöht und HRV deutlich unter deinem Mittel: Lege eine Pause ein. Bei Krankheitsgefühl ärztlich abklären lassen.'
  return null
}

// ───────────── Anpassung ─────────────

export type Action = 'none' | 'reduce' | 'downgrade' | 'convert' | 'rest' | 'mobility'

export interface AdjustedSession {
  original: Session
  /** null = gestrichen (Ruhetag) */
  adjusted: Session | null
  changed: boolean
  action: Action
  /** Einheiten-Faktor 0–100 % */
  factor: number
  reason: string
}

export interface UpcomingDay {
  date: ISODate
  daysAhead: number
  day: ResolvedDay
  sessions: Session[]
}

export interface AdjustContext {
  assessment: Assessment
  day: ResolvedDay
  prevDay?: ResolvedDay
  upcoming: UpcomingDay[]
  settings: Settings
  /** gelernter Abfall der Recovery nach Nachtschicht (Punkte), aus analytics */
  learnedNightShiftDrop?: number
}

const isHigh = (s: Session) => s.sensitivity === 'high' && s.type !== 'RACE'
const hasAttempt = (s: Session) => !!s.exercises?.some((e) => e.attempt)

function withoutAttempts(s: Session): Session {
  const exercises = s.exercises?.filter((e) => !e.attempt)
  return { ...s, exercises, structure: { ...s.structure, main: s.structure.main.filter((l) => !l.startsWith('Versuch:')) } }
}

function yellowReduction(a: Assessment): number {
  const { min, max } = RECOVERY.yellowReduction
  const x = a.readiness ?? a.score ?? 50
  // Readiness 66 → min, 34 → max
  const t = clamp((RECOVERY_ZONES.green - 1 - x) / (RECOVERY_ZONES.green - 1 - RECOVERY_ZONES.yellow), 0, 1)
  return min + t * (max - min)
}

const round5 = (x: number) => Math.max(5, Math.floor(x / 5) * 5)

/** Harte Einheit eine Stufe runter */
function downgrade(s: Session, pct: number, settings: Settings): Session {
  const minutes = round5(s.durationMin * (1 - pct))
  switch (s.type) {
    case 'HILL_INTERVALS':
    case 'THRESHOLD':
      return toEasyRun(s, minutes, settings)
    case 'LEGS_HEAVY':
    case 'LEGS_ECCENTRIC':
      return { ...legsTechnical(s), durationMin: Math.min(30, minutes) }
    case 'STRENGTH_TEST':
      return {
        ...s,
        type: 'CALI_SKILL',
        sensitivity: 'low',
        key: false,
        title: 'Technik statt Krafttest',
        goal: 'Krafttest auf einen Tag mit grüner Recovery verschieben – heute nur Technik auf der aktuellen Stufe.',
        durationMin: Math.min(30, minutes),
        intensity: { level: 1, rpe: 'RPE 5–6' },
        structure: { warmup: s.structure.warmup, main: ['Aktuelle Stufen locker üben, keine Maximalversuche'], cooldown: [] },
        exercises: [],
      }
    default:
      return { ...s, durationMin: minutes }
  }
}

function describe(s: Session): string {
  return s.distanceKm && s.category === 'run' ? `${s.title}` : s.title
}

const dayWord = (n: number) => (n === 1 ? 'morgen' : n === 2 ? 'übermorgen' : `in ${n} Tagen`)

function prefix(a: Assessment, ctx: AdjustContext): string {
  const parts: string[] = []
  if (a.score !== null) parts.push(`${a.source === 'manual' ? 'Readiness' : 'Recovery'} ${a.score} %`)
  if (a.sleepHours !== null && a.sleepHours < 6.5) parts.push(`nur ${fmt1(a.sleepHours)} h Schlaf${ctx.prevDay?.kind === 'NIGHT_SHIFT' ? ' nach der Nachtschicht' : ''}`)
  return parts.join(', ')
}

function factorOf(orig: Session, adj: Session | null): number {
  if (!adj) return 0
  const dur = orig.durationMin ? adj.durationMin / orig.durationMin : 1
  const lvl = adj.intensity.level < orig.intensity.level ? 0.85 ** (orig.intensity.level - adj.intensity.level) : 1
  return Math.round(clamp(dur * lvl * 100))
}

function finalize(orig: Session, adj: Session | null, action: Action, reason: string): AdjustedSession {
  // Sicherheitsnetz: nie härter als geplant
  if (adj && (adj.durationMin > orig.durationMin || adj.intensity.level > orig.intensity.level || (adj.distanceKm ?? 0) > (orig.distanceKm ?? 0) + 0.05)) {
    adj = { ...adj, durationMin: Math.min(adj.durationMin, orig.durationMin), intensity: adj.intensity.level > orig.intensity.level ? orig.intensity : adj.intensity, distanceKm: Math.min(adj.distanceKm ?? 0, orig.distanceKm ?? 0) || adj.distanceKm }
  }
  return { original: orig, adjusted: adj, changed: action !== 'none', action, factor: action === 'none' ? 100 : factorOf(orig, adj), reason }
}

function nightShiftBetween(ctx: AdjustContext, untilDaysAhead: number): boolean {
  if (ctx.day.kind === 'NIGHT_SHIFT') return true
  return ctx.upcoming.some((u) => u.daysAhead < untilDaysAhead && u.day.kind === 'NIGHT_SHIFT')
}

/**
 * Passt alle Einheiten eines Tages an. Reihenfolge der Regeln:
 * Krank → Rot → Schlaftag → Schlaf < 5 h → Gelb (nur harte Einheiten) → Vorausschau.
 */
export function adjustDay(sessions: Session[], ctx: AdjustContext): AdjustedSession[] {
  const a = ctx.assessment
  const out: AdjustedSession[] = []

  if (ctx.day.kind === 'SICK') return sessions.map((s) => finalize(s, null, 'rest', 'Krank: Pause hat Vorrang.'))

  if (!a.hasData) {
    return sessions.map((s) =>
      finalize(s, s, 'none', ctx.day.kind === 'SLEEP_DAY' ? 'Keine Erholungsdaten – vor dem Training kurz Schlaf und Gefühl eintragen.' : 'Keine Erholungsdaten – Einheit wie geplant, bitte kurz Schlaf und Gefühl eintragen.'),
    )
  }

  const pre = prefix(a, ctx)

  if (a.color === 'red') {
    let mobilityGiven = false
    for (const s of sessions) {
      if (s.type === 'RACE') {
        out.push(finalize(s, s, 'none', 'Renntag – Plan bleibt.'))
        continue
      }
      if (!mobilityGiven) {
        mobilityGiven = true
        const mob = { ...mobility({ date: s.date, slot: s.id.split(':')[1], phase: 'base', settings: ctx.settings, strength: initialStrengthState() }, Math.min(RECOVERY.redMaxMin, s.durationMin), true), id: s.id }
        mob.title = `Ruhetag – höchstens ${mob.durationMin} min Mobility oder sehr locker gehen`
        out.push(finalize(s, mob, 'mobility', `${pre}: Rote Recovery – Ruhetag, höchstens ${mob.durationMin} min sehr locker bzw. Mobility.`))
      } else out.push(finalize(s, null, 'rest', `${pre}: Rote Recovery – ${describe(s)} entfällt.`))
    }
    return out
  }

  const lowSleep = a.sleepHours !== null && a.sleepHours < RECOVERY.minSleepH

  if (ctx.day.kind === 'SLEEP_DAY' && (a.sleepHours === null || a.sleepHours < RECOVERY.sleepDayMinSleepH)) {
    return sessions.map((s) => finalize(s, null, 'rest', `${pre || 'Zu wenig Tagschlaf'}: Schlaftag mit weniger als ${RECOVERY.sleepDayMinSleepH} h Schlaf – Ruhetag.`))
  }

  const yellow = a.color === 'yellow'
  const pct = yellowReduction(a)

  for (const s of sessions) {
    let cur: Session = s
    let action: Action = 'none'
    const why: string[] = []

    if (lowSleep && (isHigh(cur) || cur.type === 'CALI_MAIN')) {
      if (cur.type === 'CALI_MAIN') {
        cur = { ...withoutAttempts(cur), title: `${cur.title} (leicht)`, durationMin: round5(cur.durationMin * 0.75), intensity: { level: 1, rpe: 'RPE 6, technisch sauber' } }
        why.push('Kraft leicht statt schwer')
      } else {
        cur = downgrade(cur, Math.max(pct, RECOVERY.yellowReduction.min), ctx.settings)
        why.push(`${TYPE_LABEL[s.type]} wird ${cur.title}`)
      }
      action = 'downgrade'
    } else if (yellow && isHigh(cur)) {
      cur = downgrade(cur, pct, ctx.settings)
      action = 'downgrade'
      why.push(`${TYPE_LABEL[s.type]} wird ${cur.title.toLowerCase().startsWith('locker') ? cur.title.replace(/^L/, 'l') : cur.title}${cur.durationMin !== s.durationMin ? `, ${cur.durationMin} statt ${s.durationMin} min` : ''}`)
    } else if (yellow && hasAttempt(cur)) {
      cur = withoutAttempts(cur)
      action = 'downgrade'
      why.push('neue Skill-Stufe wird Training auf der aktuellen Stufe')
    }

    // Vorausschau (SPEC 6.3a): nur harte Einheiten, nur mit Auslöser
    const look = lookahead(s, cur, ctx)
    if (look) {
      cur = look.session
      action = look.action
      why.length = 0
      why.push(look.text)
    }

    if (action === 'none') {
      out.push(finalize(s, s, 'none', yellow ? `${pre}: Gelb – ${describe(s)} läuft wie geplant (nur harte Einheiten werden reduziert).` : a.color === 'green' ? `${pre}: Grün – Einheit wie geplant.` : 'Einheit wie geplant.'))
    } else {
      const lead = look?.lead ?? pre
      out.push(finalize(s, cur, action, `${lead}${lead ? ': ' : ''}${why.join(', ')}.`))
    }
  }
  return out
}

interface LookResult {
  session: Session
  action: Action
  text: string
  lead: string
}

function lookahead(original: Session, current: Session, ctx: AdjustContext): LookResult | null {
  if (!isHigh(original)) return null
  const a = ctx.assessment
  const triggers = [...a.triggers]
  const keys = ctx.upcoming
    .filter((u) => u.daysAhead >= 1 && u.daysAhead <= RECOVERY.lookahead.days)
    .flatMap((u) => u.sessions.filter((x) => x.key && KEY_TYPES.includes(x.type)).map((x) => ({ u, x })))
  if (!keys.length) return null
  // gelernter Abfall nach Nachtschicht
  if (ctx.learnedNightShiftDrop && a.score !== null) {
    for (const { u } of keys) {
      if (nightShiftBetween(ctx, u.daysAhead) && a.score - ctx.learnedNightShiftDrop < RECOVERY.lookahead.learnedThreshold) {
        triggers.push(`erwarteter Recovery-Abfall nach der Nachtschicht (−${Math.round(ctx.learnedNightShiftDrop)})`)
        break
      }
    }
  }
  if (!triggers.length) return null
  let best: { score: number; u: UpcomingDay; x: Session } | null = null
  for (const { u, x } of keys) {
    const imp = RECOVERY.lookahead.importance[x.type as SessionType] ?? 0.5
    const prox = RECOVERY.lookahead.proximity[u.daysAhead] ?? 0
    const night = nightShiftBetween(ctx, u.daysAhead) ? RECOVERY.lookahead.nightShiftBonus : 0
    const sc = imp * prox + night
    if (!best || sc > best.score) best = { score: sc, u, x }
  }
  if (!best) return null
  const lead = [a.score !== null ? `${a.source === 'manual' ? 'Readiness' : 'Recovery'} ${a.score} %` : '', `${dayWord(best.u.daysAhead)} steht ${best.x.title} an`]
    .filter(Boolean)
    .join(', ')
  const convert = best.score >= RECOVERY.lookahead.convertFrom
  let session: Session
  let text: string
  if (convert) {
    if (original.category === 'run') {
      const min = Math.min(RECOVERY.lookahead.convertEasyMin, current.durationMin)
      session = toEasyRun(current, min, ctx.settings)
      text = `${TYPE_LABEL[original.type]} wird ${min} min locker`
    } else if (original.type === 'LEGS_HEAVY' || original.type === 'LEGS_ECCENTRIC') {
      session = { ...current, ...legsTechnical(original), type: 'MOBILITY', category: 'mobility', sensitivity: 'low', title: 'Mobility statt schwerem Beintraining', durationMin: 20, intensity: { level: 0, rpe: 'entspannt' }, exercises: [], structure: { warmup: [], main: ['Hüfte, Sprunggelenk, Waden mobilisieren'], cooldown: [] } }
      text = 'schweres Beintraining wird Mobility'
    } else {
      session = downgrade(current, RECOVERY.yellowReduction.max, ctx.settings)
      text = `${TYPE_LABEL[original.type]} wird ${session.title}`
    }
  } else {
    const minutes = round5(current.durationMin * (1 - RECOVERY.lookahead.reducePct))
    const lvl = Math.max(0, current.intensity.level - 1) as Session['intensity']['level']
    session = { ...current, durationMin: minutes, intensity: { ...current.intensity, level: lvl, rpe: `${current.intensity.rpe} (eine Stufe lockerer)` } }
    if (session.distanceKm) session.distanceKm = Math.round(session.distanceKm * (1 - RECOVERY.lookahead.reducePct) * 10) / 10
    text = `${TYPE_LABEL[original.type]} wird reduziert (${minutes} statt ${original.durationMin} min, Intensität eine Stufe runter)`
  }
  return { session, action: convert ? 'convert' : 'reduce', text, lead }
}

// ───────────── Nachholen-Vorschlag ─────────────

/**
 * Bei sehr guter Recovery höchstens ein Vorschlag, eine gestrichene Schlüsseleinheit der
 * letzten Tage heute nachzuholen – nur an einem freien Tag ohne eigene Schlüsseleinheit.
 */
export function makeUpSuggestion(today: PlanDay, recentDays: PlanDay[], a: Assessment): { session: Session; text: string } | null {
  if (a.score === null || a.score < RECOVERY.makeUpSuggestionMin) return null
  if (today.day.availability !== 'full' || today.sessions.some((s) => s.key)) return null
  for (const pd of [...recentDays].reverse()) {
    if (pd.date >= today.date || pd.date < addDays(today.date, -RECOVERY.makeUpLookbackDays)) continue
    const d = pd.dropped.find((x) => x.session.key && x.session.type !== 'B2B_RUN' && !x.session.movedFrom && !/verschoben/.test(x.reason))
    if (d) return { session: d.session, text: `Recovery ${a.score} % – du könntest die gestrichene Einheit „${d.session.title}“ heute nachholen (freiwillig).` }
  }
  return null
}

// ───────────── Mikrozyklus-Reduktion ─────────────

/**
 * Mehrere gelbe/rote Tage in Folge oder wachsendes Schlafdefizit in Mikrozyklus i
 * → Umfang von Mikrozyklus i+1 reduzieren.
 */
export function computeMicroFactors(micros: MicroInfo[], history: RecoveryDay[]): Record<number, number> {
  const out: Record<number, number> = {}
  const colorByDate = new Map<ISODate, Color>()
  for (const h of history) {
    const sc = h.recoveryScore ?? (h.manual ? manualScore(h.manual.sleepHours, h.manual.sleepQuality, h.manual.feeling) : undefined)
    if (sc !== undefined) colorByDate.set(h.date, colorOf(sc))
  }
  const cfg = RECOVERY.micro
  for (let i = 0; i < micros.length - 1; i++) {
    const m = micros[i]
    let yr = 0
    let red = 0
    let maxYr = 0
    let maxRed = 0
    for (let d = m.start; d <= m.end; d = addDays(d, 1)) {
      const c = colorByDate.get(d)
      yr = c === 'yellow' || c === 'red' ? yr + 1 : 0
      red = c === 'red' ? red + 1 : 0
      maxYr = Math.max(maxYr, yr)
      maxRed = Math.max(maxRed, red)
    }
    const debts = history.filter((h) => h.date >= m.start && h.date <= m.end && h.sleepDebtH !== undefined).map((h) => h.sleepDebtH!)
    let rising = 0
    let maxRising = 0
    for (let k = 1; k < debts.length; k++) {
      rising = debts[k] > debts[k - 1] ? rising + 1 : 0
      maxRising = Math.max(maxRising, rising)
    }
    let f = 1
    if (maxRed >= cfg.redStreak) f = Math.min(f, cfg.redFactor)
    if (maxYr >= cfg.yellowRedStreak) f = Math.min(f, cfg.yellowRedFactor)
    if (maxRising + 1 >= cfg.debtRisingDays && debts.length && debts[debts.length - 1] >= cfg.debtMinH) f = Math.min(f, cfg.debtFactor)
    if (f < 1) out[micros[i + 1].index] = f
  }
  return out
}
