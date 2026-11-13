import { describe, expect, it } from 'vitest'
import { generatePlan, microTotals, validatePlan } from '../planner'
import { HEAVY_LEG_TYPES, LONG_TYPES, QUALITY_TYPES } from '../sessions'
import { addDays } from '../dates'
import type { DayOverride, Plan } from '../types'
import { OV, S } from './helpers'

const plan = (overrides: DayOverride[] = OV, extra: Partial<Parameters<typeof generatePlan>[0]> = {}): Plan => generatePlan({ settings: S, overrides, ...extra })

describe('Plan-Struktur', () => {
  const p = plan()
  it('beginnt am 13.11.2026 und endet mit dem Rennen am 18.06.2027', () => {
    expect(p.days[0].date).toBe('2026-11-13')
    expect(p.days[p.days.length - 1].date).toBe('2027-06-18')
    expect(p.byDate['2027-06-18'].sessions.map((s) => s.type)).toEqual(['RACE'])
  })
  it('Mesozyklen: M1 ab 16.11.2026, M6 endet 13.06.2027, Rennmikrozyklus 14.–18.06.', () => {
    const m = p.mesos.filter((x) => x.index >= 0 && x.label.startsWith('M'))
    expect(m).toHaveLength(6)
    expect(m[0].start).toBe('2026-11-16')
    expect(m[5].end).toBe('2027-06-13')
    const race = p.micros[p.micros.length - 1]
    expect([race.start, race.end, race.phase]).toEqual(['2027-06-14', '2027-06-18', 'race'])
  })
  it('Phasen in Reihenfolge und auf Mesozyklus-Grenzen', () => {
    const order = ['intro', 'base', 'build', 'specific', 'taper', 'race']
    let last = 0
    for (const m of p.micros) {
      const i = order.indexOf(m.phase)
      expect(i).toBeGreaterThanOrEqual(last)
      last = i
    }
    const firstBuild = p.micros.find((m) => m.phase === 'build')!
    const firstSpecific = p.micros.find((m) => m.phase === 'specific')!
    expect(firstBuild.posInMeso).toBe(0)
    expect(firstSpecific.posInMeso).toBe(0)
  })
  it('Entlastung am Ende jedes Mesozyklus (−35 %) und Krafttest alle 35 Tage', () => {
    for (const mi of [0, 1, 2, 3, 4]) {
      const ms = p.micros.filter((m) => m.mesoIndex === mi)
      const last = ms[ms.length - 1]
      expect(last.isDeload).toBe(true)
      expect(last.targetKm).toBeLessThan(ms[ms.length - 2].targetKm * 0.7)
      expect(p.days.some((d) => d.microIndex === last.index && d.sessions.some((s) => s.type === 'STRENGTH_TEST'))).toBe(true)
    }
  })
  it('Steigerung höchstens ca. 10 % pro Woche (Wochen-Äquivalent)', () => {
    let prev = 0
    for (const m of p.micros) {
      if (m.isDeload || m.phase === 'taper' || m.phase === 'race' || m.phase === 'intro') continue
      if (prev) expect(m.weeklyKm / prev).toBeLessThanOrEqual(1.1)
      prev = m.weeklyKm
    }
  })
  it('Start bei 20 km/Woche, Spitze 70 km/Woche', () => {
    expect(p.micros[0].weeklyKm).toBe(20)
    expect(Math.max(...p.micros.map((m) => m.weeklyKm))).toBe(70)
  })
  it('Lange Läufe und Back-to-backs nur an Tag 4/5 (freie Tage)', () => {
    for (const d of p.days) for (const s of d.sessions) if (LONG_TYPES.includes(s.type)) expect([4, 5]).toContain(d.day.cycleDay)
  })
  it('Bergwochenenden auf zwei freien Tagen am Stück', () => {
    const m = p.days.filter((d) => d.sessions.some((s) => s.type === 'MOUNTAIN_DAY'))
    expect(m.length).toBe(6)
    for (const d of m) expect(d.day.availability).toBe('full')
  })
  it('Verpflegungstraining ab der Aufbauphase bei langen Läufen', () => {
    const base = p.days.filter((d) => d.phase === 'base').flatMap((d) => d.sessions).filter((s) => s.type === 'LONG_RUN')
    const spec = p.days.filter((d) => d.phase === 'specific').flatMap((d) => d.sessions).filter((s) => s.type === 'LONG_RUN')
    expect(base.every((s) => !s.fueling)).toBe(true)
    expect(spec.every((s) => !!s.fueling && s.gearTest)).toBe(true)
  })
  it('Jede Einheit hat Ziel, Dauer, Intensität und Ablauf; Kraft hat Übungen', () => {
    for (const s of p.days.flatMap((d) => d.sessions)) {
      expect(s.goal.length).toBeGreaterThan(10)
      expect(s.durationMin).toBeGreaterThan(0)
      expect(s.intensity.rpe).toBeTruthy()
      expect(s.structure.main.length).toBeGreaterThan(0)
      if (s.category === 'strength' || s.category === 'test') expect(s.exercises?.length).toBeGreaterThan(0)
    }
  })
  it('Regelprüfung ohne Verstöße', () => {
    expect(validatePlan(p)).toEqual([])
  })
})

describe('Harte Regeln aus Schichtplan', () => {
  const p = plan()
  it('keine Einheit an Tag 1 (Tagschicht)', () => {
    for (const d of p.days) if (d.day.kind === 'DAY_SHIFT') expect(d.sessions).toEqual([])
  })
  it('an Tag 2 sind alle Einheitentypen erlaubt, solange sie ins Fenster passen', () => {
    const tag2 = p.days.filter((d) => d.day.kind === 'NIGHT_SHIFT')
    const types = new Set(tag2.flatMap((d) => d.sessions.map((s) => s.type)))
    for (const t of ['HILL_INTERVALS', 'THRESHOLD', 'LEGS_HEAVY', 'CALI_MAIN', 'STRENGTH_TEST']) expect(types).toContain(t)
    for (const d of tag2) {
      const end = Math.max(...d.sessions.map((s) => Number(s.startTime!.slice(0, 2)) * 60 + Number(s.startTime!.slice(3)) + s.durationMin), 0)
      expect(end).toBeLessThanOrEqual(13 * 60 + 30)
    }
  })
  it('Schlaftag (Tag 3) nur lockere/optionale Einheiten', () => {
    for (const d of p.days) if (d.day.kind === 'SLEEP_DAY') for (const s of d.sessions) expect(['RECOVERY_RUN', 'MOBILITY', 'CALI_SKILL', 'SHAKEOUT']).toContain(s.type)
  })
  it('kein schweres Beintraining am Vortag eines langen Laufs, einer Qualitätseinheit oder des Rennens', () => {
    for (const d of p.days) {
      if (!d.sessions.some((s) => HEAVY_LEG_TYPES.includes(s.type))) continue
      const next = p.byDate[addDays(d.date, 1)]
      expect(next?.sessions.some((s) => LONG_TYPES.includes(s.type) || QUALITY_TYPES.includes(s.type) || s.type === 'RACE') ?? false).toBe(false)
    }
  })
  it('schweres Beintraining wird gestrichen, wenn ein Tausch einen langen Lauf auf den Folgetag bringt', () => {
    // Tag 2 (17.11.) hat schweres Beintraining; wird Tag 3 (18.11.) per Tausch frei und
    // Tag 4 Fortbildung, wandert der lange Lauf … wir erzwingen: Tag 3 frei, Tag 4 Fortbildung
    const ov: DayOverride[] = [...OV, { date: '2026-11-17', type: 'URLAUB' }, { date: '2026-11-19', type: 'FORTBILDUNG' }]
    const q = plan(ov)
    expect(validatePlan(q)).toEqual([])
  })
})

describe('V-Schicht kurzfristig eingetragen', () => {
  // Rennspezifischer B2B-Mikrozyklus: 25.04.(T) 26.(N) 27.(S) 28.(F, langer Lauf) 29.(F, Back-to-back)
  const before = plan()
  it('Ausgangslage: langer Lauf an Tag 4, Back-to-back an Tag 5', () => {
    expect(before.byDate['2027-04-28'].sessions.some((s) => s.type === 'LONG_RUN')).toBe(true)
    expect(before.byDate['2027-04-29'].sessions.some((s) => s.type === 'B2B_RUN')).toBe(true)
  })
  it('V an Tag 5: Back-to-back wird gestrichen, nichts landet auf Tag 1 oder wird gequetscht', () => {
    const p = plan([...OV, { date: '2027-04-29', type: 'V' }])
    const d5 = p.byDate['2027-04-29']
    expect(d5.sessions).toEqual([])
    expect(d5.dropped.map((x) => x.session.type)).toContain('B2B_RUN')
    expect(p.byDate['2027-04-30'].sessions).toEqual([]) // Tag 1
    // Tag 4 bekommt nichts dazu
    expect(p.byDate['2027-04-28'].sessions.map((s) => s.id)).toEqual(before.byDate['2027-04-28'].sessions.map((s) => s.id))
    // Mikrozyklus-Umfang sinkt (kein Nachholen)
    expect(microTotals(p, 33).km).toBeLessThan(microTotals(before, 33).km)
    expect(validatePlan(p)).toEqual([])
  })
  it('Fortbildung an Tag 4: langer Lauf wird einmal auf Tag 5 verschoben und ersetzt das Back-to-back', () => {
    const p = plan([...OV, { date: '2027-04-28', type: 'FORTBILDUNG' }])
    const d5 = p.byDate['2027-04-29']
    const moved = d5.sessions.find((s) => s.type === 'LONG_RUN')!
    expect(moved.movedFrom).toBe('2027-04-28')
    expect(d5.sessions.some((s) => s.type === 'B2B_RUN')).toBe(false)
    expect(p.byDate['2027-04-28'].dropped[0].reason).toMatch(/verschoben/)
    expect(validatePlan(p)).toEqual([])
  })
})

describe('Verpasste Einheiten', () => {
  it('verpasster langer Lauf wird höchstens einmal verschoben, Umfang wird nicht nachgeholt', () => {
    // Grundlage: 19.11. langer Lauf (Tag 4), 20.11. lockerer Lauf (Tag 5)
    const base = plan()
    const longId = base.byDate['2026-11-19'].sessions.find((s) => s.type === 'LONG_RUN')!.id
    const earlier = base.days.filter((d) => d.date < '2026-11-19').flatMap((d) => d.sessions.map((s) => ({ sessionId: s.id, date: d.date, status: 'done' as const })))
    const p = plan(OV, { today: '2026-11-20', logs: earlier })
    const d5 = p.byDate['2026-11-20']
    const moved = d5.sessions.find((s) => s.id === longId)
    expect(moved?.movedFrom).toBe('2026-11-19')
    // lockerer Lauf wurde ersetzt, nicht zusätzlich
    expect(d5.sessions.filter((s) => s.category === 'run')).toHaveLength(1)
    expect(microTotals(p, 1).km).toBeLessThanOrEqual(microTotals(base, 1).km)
    // Auch an Tag 5 verpasst → gestrichen, kein zweites Verschieben
    const q = plan(OV, { today: '2026-11-21', logs: earlier })
    expect(q.days.some((d) => d.sessions.some((s) => s.id === longId))).toBe(false)
    expect(q.days.some((d) => d.dropped.some((x) => x.session.id === longId && /gestrichen/.test(x.reason)))).toBe(true)
  })
  it('erledigte Einheiten bleiben, wo sie sind', () => {
    const base = plan()
    const longId = base.byDate['2026-11-19'].sessions.find((s) => s.type === 'LONG_RUN')!.id
    const p = plan(OV, { today: '2026-11-21', logs: [{ sessionId: longId, date: '2026-11-19', status: 'done' }] })
    expect(p.byDate['2026-11-19'].sessions.some((s) => s.id === longId)).toBe(true)
  })
})

describe('Taper und Rennwoche', () => {
  const p = plan()
  it('Umfang im Taper deutlich runter, Kraft kurz', () => {
    const spec = p.micros.filter((m) => m.phase === 'specific' && !m.isDeload && !m.isMountain)
    const taper = p.micros.filter((m) => m.phase === 'taper')
    expect(taper).toHaveLength(2)
    const peak = Math.max(...spec.map((m) => m.targetKm))
    expect(taper[0].targetKm).toBeLessThan(peak * 0.75)
    expect(taper[1].targetKm).toBeLessThan(taper[0].targetKm)
    const strength = p.days.filter((d) => d.phase === 'taper').flatMap((d) => d.sessions).filter((s) => s.category === 'strength')
    for (const s of strength) expect(s.durationMin).toBeLessThanOrEqual(30)
  })
  it('Rennwoche: nur lockere Einheiten, Hinweis bei Nachtschicht am 15.06.', () => {
    const rw = p.days.filter((d) => d.phase === 'race' && d.date < '2027-06-18')
    for (const d of rw) for (const s of d.sessions) expect(s.sensitivity).toBe('low')
    expect(p.byDate['2027-06-15'].notes.join(' ')).toMatch(/Nachtschicht im Taper/)
  })
})

describe('Mikrozyklus-Reduktion aus Erholung', () => {
  it('microFactors reduzieren den Umfang des betroffenen Mikrozyklus', () => {
    const a = plan()
    const b = plan(OV, { microFactors: { 5: 0.75 } })
    expect(b.micros[5].targetKm).toBeCloseTo(a.micros[5].targetKm * 0.75, 0)
    expect(microTotals(b, 5).km).toBeLessThan(microTotals(a, 5).km)
  })
})
