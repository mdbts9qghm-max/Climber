import { describe, expect, it } from 'vitest'
import { cycleForDay, matchWorkouts, recoveryForDay, recoveryHistory, type WhoopData } from '../whoop'
import { sampleWhoop } from '../sampleData'
import { berlinParts, berlinToUtcMs } from '../dates'
import { generatePlan } from '../planner'
import { resolveDays } from '../shifts'
import { OV, S, day } from './helpers'

describe('WHOOP-Zuordnung über Zyklen', () => {
  const data = sampleWhoop(S, OV, '2026-11-10', '2026-11-30')

  it('Schlaf nach der Nachtschicht (08:00–14:00) wird dem Schlaftag zugeordnet', () => {
    const sleepDay = day('2026-11-18')
    expect(sleepDay.kind).toBe('SLEEP_DAY')
    const r = recoveryForDay(sleepDay, data)!
    expect(r).toBeTruthy()
    const start = berlinParts(r.sleepStart!)
    const end = berlinParts(r.sleepEnd!)
    expect(start.date).toBe('2026-11-18')
    expect(start.time).toBe('08:05')
    expect(end.time).toBe('13:50')
    expect(r.sleepHours!).toBeGreaterThan(4.5)
  })
  it('Tag 2 bekommt die Recovery der Nacht davor (nicht den Nap)', () => {
    const r = recoveryForDay(day('2026-11-17'), data)!
    expect(berlinParts(r.sleepStart!).date).toBe('2026-11-16')
    expect(berlinParts(r.sleepEnd!).time).toBe('07:45')
  })
  it('Kalendertag-Zuordnung wäre falsch: der Zyklus des Schlaftags beginnt erst um 08:05', () => {
    const c = cycleForDay(day('2026-11-18'), data.cycles)!
    expect(berlinParts(c.start).time).toBe('08:05')
  })
  it('auch über die Sommerzeitumstellung korrekt', () => {
    const d2 = sampleWhoop(S, OV, '2027-03-24', '2027-04-02')
    const days = resolveDays('2027-03-25', '2027-04-01', OV, S)
    const sleepDays = days.filter((d) => d.kind === 'SLEEP_DAY')
    for (const sd of sleepDays) {
      const r = recoveryForDay(sd, d2)!
      expect(berlinParts(r.sleepStart!).date).toBe(sd.date)
      expect(berlinParts(r.sleepStart!).time).toBe('08:05')
    }
  })
  it('Verlauf: WHOOP vor manueller Eingabe, manuell als Ersatz', () => {
    const days = resolveDays('2026-11-16', '2026-11-20', OV, S)
    const h = recoveryHistory(days, { ...data, cycles: data.cycles.filter((c) => berlinParts(c.start).date < '2026-11-19') }, [{ date: '2026-11-20', sleepHours: 7, sleepQuality: 4, feeling: 4 }])
    expect(h.find((x) => x.date === '2026-11-16')?.source).toBe('whoop')
    expect(h.find((x) => x.date === '2026-11-20')?.source).toBe('manual')
  })
  it('fehlende Daten liefern undefined statt Fehler', () => {
    const empty: WhoopData = { cycles: [], recoveries: [], sleeps: [], workouts: [] }
    expect(recoveryForDay(day('2026-11-18'), empty)).toBeUndefined()
  })
})

describe('Workouts → geplante Einheiten', () => {
  const plan = generatePlan({ settings: S, overrides: OV })
  it('Lauf am Vormittag des langen Lauftags wird dem langen Lauf zugeordnet, Kraft der Kraft', () => {
    const d = plan.byDate['2026-11-20']
    const runS = d.sessions.find((s) => s.category === 'run')!
    const caliS = d.sessions.find((s) => s.type === 'CALI_MAIN')!
    const w = [
      { id: 'w1', start: new Date(berlinToUtcMs('2026-11-20', '08:40')).toISOString(), end: new Date(berlinToUtcMs('2026-11-20', '09:45')).toISOString(), sport_name: 'running', score_state: 'SCORED', score: { strain: 10, distance_meter: 8100, altitude_gain_meter: 220 } },
      { id: 'w2', start: new Date(berlinToUtcMs('2026-11-20', '10:10')).toISOString(), end: new Date(berlinToUtcMs('2026-11-20', '11:15')).toISOString(), sport_name: 'weightlifting', score_state: 'SCORED', score: { strain: 8 } },
    ]
    const m = matchWorkouts(plan.days, w)
    expect(m.get('w1')).toBe(runS.id)
    expect(m.get('w2')).toBe(caliS.id)
    // manuelle Korrektur hat Vorrang
    const m2 = matchWorkouts(plan.days, w, { w1: null })
    expect(m2.has('w1')).toBe(false)
  })
})
