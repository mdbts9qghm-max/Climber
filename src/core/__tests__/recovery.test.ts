import { describe, expect, it } from 'vitest'
import { adjustDay, assess, computeMicroFactors, warningSignal, type AdjustContext, type UpcomingDay } from '../recovery'
import { buildSkeleton } from '../skeleton'
import { b2bRun, easyRun, longRun, threshold } from '../sessions'
import type { RecoveryDay, Session } from '../types'
import { S, addDays, allTypes, assessFor, ctx, day, rec } from './helpers'

// Freier Tag 4 (19.11.2026) als neutraler Testtag, Tag 5 = 20.11.
const D = '2026-11-19'
const run = (sessions: Session[], score: number | null, extra: Partial<RecoveryDay> = {}, upcoming: UpcomingDay[] = [], date = D) => {
  const c: AdjustContext = { assessment: assessFor(date, score, extra), day: day(date), prevDay: day(addDays(date, -1)), upcoming, settings: S }
  return adjustDay(sessions, c)
}

describe('Ampel für jeden Einheitentyp', () => {
  const sessions = allTypes(D)
  it('Grün: alle Einheiten wie geplant', () => {
    for (const r of run(sessions, 80)) {
      expect(r.changed).toBe(false)
      expect(r.factor).toBe(100)
    }
  })
  it('Gelb: nur harte Einheiten werden runtergestuft (Intensität −1, Dauer 10–25 % kürzer)', () => {
    const res = run(sessions, 50)
    for (const r of res) {
      if (r.original.sensitivity === 'high') {
        expect(r.changed).toBe(true)
        expect(r.adjusted!.intensity.level).toBeLessThan(r.original.intensity.level)
        const cut = 1 - r.adjusted!.durationMin / r.original.durationMin
        if (r.original.category === 'run') expect(cut).toBeGreaterThanOrEqual(0.08)
        expect(cut).toBeLessThanOrEqual(0.5)
      } else {
        expect(r.changed).toBe(false)
        expect(r.adjusted).toEqual(r.original)
      }
    }
    const intervals = res.find((r) => r.original.type === 'HILL_INTERVALS')!
    expect(intervals.adjusted!.type).toBe('EASY_RUN')
    const legs = res.find((r) => r.original.type === 'LEGS_HEAVY')!
    expect(legs.adjusted!.title).toMatch(/technisch/)
  })
  it('Gelb: lange Läufe, Höhenmeter-Einheiten, Calisthenics-Hauptsession und lockere Einheiten bleiben unverändert', () => {
    const res = run(sessions, 40)
    for (const t of ['LONG_RUN', 'B2B_RUN', 'HILL_TREADMILL', 'CALI_MAIN', 'EASY_RUN', 'RECOVERY_RUN', 'MOBILITY']) {
      const r = res.find((x) => x.original.type === t)!
      expect(r.changed, t).toBe(false)
    }
  })
  it('Rot: Ruhetag oder höchstens 30 min sehr locker/Mobility', () => {
    const res = run(sessions, 20)
    const kept = res.filter((r) => r.adjusted)
    expect(kept).toHaveLength(1)
    expect(kept[0].adjusted!.durationMin).toBeLessThanOrEqual(30)
    expect(kept[0].adjusted!.type).toBe('MOBILITY')
    expect(res.filter((r) => !r.adjusted).every((r) => r.factor === 0)).toBe(true)
  })
  it('Schlaf unter 5 h: keine Intensität und kein schweres Krafttraining, auch bei grüner Recovery', () => {
    const res = run(sessions, 75, { sleepHours: 4.5 })
    for (const r of res) {
      const a = r.adjusted!
      if (['HILL_INTERVALS', 'THRESHOLD'].includes(r.original.type)) expect(a.type).toBe('EASY_RUN')
      if (r.original.type === 'LEGS_HEAVY') expect(a.type).toBe('LEGS_MAINT')
      if (r.original.type === 'CALI_MAIN') expect(a.intensity.level).toBeLessThan(r.original.intensity.level)
      if (r.original.type === 'LONG_RUN') expect(r.changed).toBe(false)
    }
  })
  it('wird nie härter als geplant', () => {
    for (const score of [10, 40, 60, 90]) for (const r of run(sessions, score)) if (r.adjusted) {
      expect(r.adjusted.durationMin).toBeLessThanOrEqual(r.original.durationMin)
      expect(r.adjusted.intensity.level).toBeLessThanOrEqual(r.original.intensity.level)
    }
  })
  it('Begründung in einem Satz mit Werten', () => {
    const r = run([threshold(ctx(D), 8)], 41, { sleepHours: 5.5 })[0]
    expect(r.reason).toMatch(/Recovery 41 %/)
    expect(r.reason).toMatch(/5,5 h Schlaf/)
    expect(r.reason).toMatch(/Schwellenlauf wird/)
  })
})

describe('Schlaftag (Tag 3)', () => {
  const S3 = '2026-11-18'
  const easy = () => [easyRun(ctx(S3), 5)]
  it('Training nur bei mindestens Gelb und ≥ 5 h Tagschlaf', () => {
    expect(run(easy(), 50, { sleepHours: 5.8 }, [], S3)[0].adjusted).not.toBeNull()
    expect(run(easy(), 50, { sleepHours: 4.5 }, [], S3)[0].adjusted).toBeNull()
    expect(run(easy(), 25, { sleepHours: 6 }, [], S3)[0].adjusted?.type).toBe('MOBILITY')
  })
})

describe('Tag 2 vor der Nachtschicht', () => {
  const T2 = '2026-11-17'
  it('Grün: Einheit wie geplant (keine pauschale Obergrenze)', () => {
    const r = run([threshold(ctx(T2), 8)], 75, {}, [], T2)[0]
    expect(r.changed).toBe(false)
  })
  it('Gelb: wie an jedem anderen Tag nur harte Einheiten runter', () => {
    const r = run([threshold(ctx(T2), 8), easyRun(ctx(T2, 'e'), 6)], 50, {}, [], T2)
    expect(r[0].changed).toBe(true)
    expect(r[1].changed).toBe(false)
  })
})

describe('Vorausschauende Erholung (6.3a)', () => {
  // Tag 2 (26.04.2027), Back-to-back an Tag 4 (28.04.) und 5 (29.04.)
  const T2 = '2027-04-26'
  const upcoming: UpcomingDay[] = [
    { date: '2027-04-27', daysAhead: 1, day: day('2027-04-27'), sessions: [] },
    { date: '2027-04-28', daysAhead: 2, day: day('2027-04-28'), sessions: [longRun(ctx('2027-04-28', 'long', 'specific'), 35)] },
  ]
  const thr = () => threshold(ctx(T2, 'run', 'specific'), 8)
  const easy = () => easyRun(ctx(T2, 'e', 'specific'), 6)

  it('Gelb vor Back-to-back: Schwellenlauf wird 45 min locker statt gestrichen, lockere Einheit unverändert', () => {
    const [a, b] = run([thr(), easy()], 55, {}, upcoming, T2)
    expect(a.adjusted).not.toBeNull()
    expect(a.adjusted!.type).toBe('EASY_RUN')
    expect(a.adjusted!.durationMin).toBe(45)
    expect(a.reason).toMatch(/übermorgen steht Langer Lauf 35 km an/)
    expect(a.reason).toMatch(/45 min locker/)
    expect(b.changed).toBe(false)
  })
  it('Grün ohne weiteren Auslöser: wie geplant – Nachtschicht allein löst nichts aus', () => {
    const [a] = run([thr()], 80, {}, upcoming, T2)
    expect(a.changed).toBe(false)
  })
  it('Grün, aber HRV fällt seit 3 Tagen: harte Einheit wird reduziert', () => {
    const history: RecoveryDay[] = [rec(addDays(T2, -2), 75, { hrv: 60 }), rec(addDays(T2, -1), 72, { hrv: 55 })]
    const assessment = assess({ date: T2, day: day(T2), prevDay: day(addDays(T2, -1)), today: rec(T2, 70, { hrv: 50 }), history, weights: S.weights })
    expect(assessment.triggers.join()).toMatch(/HRV fällt/)
    const [a] = adjustDay([thr()], { assessment, day: day(T2), prevDay: day(addDays(T2, -1)), upcoming, settings: S })
    expect(a.changed).toBe(true)
    expect(a.adjusted).not.toBeNull()
  })
  it('Rot oder unter 5 h Schlaf: harte Einheit wird gestrichen', () => {
    expect(run([thr()], 25, {}, upcoming, T2)[0].adjusted?.type).toBe('MOBILITY')
    const low = run([thr()], 60, { sleepHours: 4.2 }, upcoming, T2)[0]
    expect(low.adjusted!.intensity.level).toBeLessThanOrEqual(1)
  })
  it('gelernter Abfall nach Nachtschicht wirkt als Auslöser', () => {
    const c: AdjustContext = { assessment: assessFor(T2, 70), day: day(T2), prevDay: day(addDays(T2, -1)), upcoming, settings: S, learnedNightShiftDrop: 25 }
    const [a] = adjustDay([thr()], c)
    expect(a.changed).toBe(true)
    expect(a.reason).toMatch(/übermorgen/)
  })
  it('B2B-Lauf selbst (mittlere Empfindlichkeit) bleibt bei Gelb unverändert', () => {
    const [a] = run([b2bRun(ctx('2027-04-29', 'b2b', 'specific'), 15)], 50, {}, [], '2027-04-29')
    expect(a.changed).toBe(false)
  })
})

describe('Fehlende WHOOP-Daten', () => {
  it('führen zur manuellen Eingabe statt zu einem Fehler', () => {
    const a = assessFor(D, null)
    expect(a.hasData).toBe(false)
    const res = adjustDay([threshold(ctx(D), 8)], { assessment: a, day: day(D), upcoming: [], settings: S })
    expect(res[0].changed).toBe(false)
    expect(res[0].reason).toMatch(/eintragen/)
  })
  it('manuelle Eingabe ergibt Ampel und Anpassung', () => {
    const a = assess({ date: D, day: day(D), today: { date: D, source: 'manual', sleepHours: 5.5, manual: { date: D, sleepHours: 5.5, sleepQuality: 1, feeling: 2 } }, history: [], weights: S.weights })
    expect(a.hasData).toBe(true)
    expect(a.color).toBe('red')
    const good = assess({ date: D, day: day(D), today: { date: D, source: 'manual', sleepHours: 8, manual: { date: D, sleepHours: 8, sleepQuality: 5, feeling: 4 } }, history: [], weights: S.weights })
    expect(good.color).toBe('green')
  })
})

describe('Warnsignal und Mikrozyklus-Reduktion', () => {
  it('Ruhepuls erhöht + HRV niedrig über mehrere Tage → Warnung', () => {
    const hist: RecoveryDay[] = []
    for (let i = 30; i >= 5; i--) hist.push(rec(addDays(D, -i), 70, { rhr: 50, hrv: 60 }))
    for (let i = 4; i >= 1; i--) hist.push(rec(addDays(D, -i), 40, { rhr: 57, hrv: 42 }))
    expect(warningSignal(hist, D)).toMatch(/Pause/)
    expect(warningSignal(hist.slice(0, -4), D)).toBeNull()
  })
  it('mehrere rote Tage in Folge senken den nächsten Mikrozyklus', () => {
    const sk = buildSkeleton(S)
    const m = sk.micros[3]
    const hist = [rec(addDays(m.start, 1), 20), rec(addDays(m.start, 2), 25)]
    const f = computeMicroFactors(sk.micros, hist)
    expect(f[4]).toBeLessThan(1)
    expect(f[3]).toBeUndefined()
  })
  it('drei gelbe Tage in Folge senken ebenfalls; einzelne gelbe Tage nicht', () => {
    const sk = buildSkeleton(S)
    const m = sk.micros[6]
    expect(computeMicroFactors(sk.micros, [rec(m.start, 50), rec(addDays(m.start, 1), 45), rec(addDays(m.start, 2), 55)])[7]).toBe(0.85)
    expect(computeMicroFactors(sk.micros, [rec(m.start, 50), rec(addDays(m.start, 1), 80), rec(addDays(m.start, 2), 55)])[7]).toBeUndefined()
  })
  it('wachsendes Schlafdefizit senkt den nächsten Mikrozyklus', () => {
    const sk = buildSkeleton(S)
    const m = sk.micros[8]
    const hist = [0, 1, 2].map((i) => rec(addDays(m.start, i), 75, { sleepDebtH: 1.5 + i * 0.6 }))
    expect(computeMicroFactors(sk.micros, hist)[9]).toBe(0.9)
  })
})
