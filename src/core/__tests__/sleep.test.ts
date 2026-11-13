import { describe, expect, it } from 'vitest'
import { recommendSleep, complianceScore, tipFor } from '../sleep'
import { generatePlan } from '../planner'
import { toMin } from '../dates'
import { OV, S, addDays, day } from './helpers'

const plan = generatePlan({ settings: S, overrides: OV })
const sleepFor = (date: string, extra: { debtH?: number } = {}) =>
  recommendSleep({ day: day(date), next: day(addDays(date, 1)), planDay: plan.byDate[date], nextPlanDay: plan.byDate[addDays(date, 1)], settings: S, ...extra })

describe('Schlafempfehlungen', () => {
  it('Abend vor der Tagschicht: Aufstehzeit passt zu Arbeitsweg und Arbeitsbeginn 06:45', () => {
    const r = sleepFor('2026-11-20') // Tag 5, morgen Tagschicht
    const wake = toMin(r.night!.end)
    // Aufstehen + 30 min Routine + 15 min Weg ≤ 06:45
    expect(wake + S.shift.morningRoutineMin + S.shift.commuteMin).toBeLessThanOrEqual(toMin('06:45'))
    expect(r.night!.end).toBe('06:00')
    // Schlafbedarf 8 h gedeckt: Schlafenszeit ca. 21:45
    expect(r.night!.start).toBe('21:45')
    expect(r.notes.join(' ')).toMatch(/Abfahrt 06:30/)
  })
  it('Nach der Tagschicht: normal schlafen, morgens ausschlafen', () => {
    const r = sleepFor('2026-11-16')
    expect(toMin(r.night!.end)).toBeGreaterThanOrEqual(toMin('07:30'))
  })
  it('Tag 2: Training endet vor dem Nap, Nap ca. 15:00–16:30, Abfahrt 18:30', () => {
    const r = sleepFor('2026-11-17')
    expect(r.nap).toEqual({ start: '15:00', end: '16:30' })
    expect(r.departure).toBe('18:30')
    expect(r.night).toBeUndefined()
    const sessions = plan.byDate['2026-11-17'].sessions
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) expect(toMin(s.startTime!) + s.durationMin).toBeLessThanOrEqual(toMin(r.nap!.start) - 60)
  })
  it('Tag 2 mit großem Schlafdefizit: längerer Nap, aber Aufstehen spätestens 30 min vor Abfahrt', () => {
    const r = sleepFor('2026-11-17', { debtH: 3 })
    expect(toMin(r.nap!.end)).toBeGreaterThan(toMin('16:30'))
    expect(toMin(r.nap!.end)).toBeLessThanOrEqual(toMin('18:00'))
  })
  it('Nach der Nachtschicht: Tagschlaf 08:00–14:00, Abend des Schlaftags im normalen Rhythmus', () => {
    const r = sleepFor('2026-11-18')
    expect(r.daySleep).toEqual({ start: '08:00', end: '14:00' })
    const bed = toMin(r.night!.start)
    expect(bed).toBeGreaterThanOrEqual(toMin('21:30'))
    expect(bed).toBeLessThanOrEqual(toMin('23:30'))
    // Training an Tag 3 endet spätestens 3 h vor der Schlafenszeit
    expect(toMin(r.latestTrainingEnd!)).toBe(bed - 180)
    for (const s of plan.byDate['2026-11-18'].sessions) expect(toMin(s.startTime!) + s.durationMin).toBeLessThanOrEqual(toMin(r.latestTrainingEnd!))
  })
  it('Vor Schlüsseleinheiten früher ins Bett', () => {
    const r = sleepFor('2026-11-18') // morgen langer Lauf
    expect(r.night!.start).toBe('22:00')
  })
  it('Nachtlauf verschiebt die Empfehlung', () => {
    const nightDay = plan.days.find((d) => d.sessions.some((s) => s.type === 'NIGHT_RUN'))!
    const r = sleepFor(nightDay.date)
    expect(toMin(r.night!.start)).toBeLessThan(toMin('06:00')) // nach Mitternacht
  })
  it('Renntag: Nap am Nachmittag, keine Nacht', () => {
    const r = sleepFor('2027-06-18')
    expect(r.nap).toBeTruthy()
    expect(r.noNightReason).toMatch(/Rennen/)
    expect(sleepFor('2027-06-12').notes.join(' ')).toMatch(/Noch 6 Tage/)
  })
  it('Umsetzungs-Score und Tipps', () => {
    expect(complianceScore({ start: '22:00', end: '06:00' }, { start: '22:00', end: '06:00' })).toBe(100)
    expect(complianceScore({ start: '22:00', end: '06:00' }, { start: '23:30', end: '06:00' })).toBeLessThan(80)
    const tips = Array.from({ length: 9 }, (_, i) => tipFor(addDays('2026-11-13', i))).filter(Boolean)
    expect(tips.length).toBe(3)
    expect(new Set(tips).size).toBe(3)
  })
})
