import { describe, expect, it } from 'vitest'
import { exportIcs, icsToOverrides, parseIcs } from '../ics'
import { raceWeek, vacationWarning } from '../race'
import { weeklyTotals } from '../weeks'
import { generatePlan } from '../planner'
import { computePatterns } from '../analytics'
import { buildEngine, dayView } from '../engine'
import { sampleWhoop } from '../sampleData'
import { isoWeek } from '../dates'
import { OV, S } from './helpers'

const plan = generatePlan({ settings: S, overrides: OV })

describe('Rennwoche und Urlaubswarnung', () => {
  it('ohne Urlaub: Konflikt am 19.06. (Tagschicht) wird deutlich gemeldet', () => {
    const w = vacationWarning(S, [])
    expect(w).toMatch(/Urlaub beantragen/)
    expect(w).toMatch(/19\.06\.2027 \(Tagschicht\)/)
    const rw = raceWeek(S, [])
    expect(rw.map((d) => d.shift)).toEqual(['Tagschicht', 'Nachtschicht', 'Schlaftag', 'Frei', 'Frei', 'Tagschicht', 'Nachtschicht'])
  })
  it('mit genehmigtem Urlaub 18.–20.06.: keine Warnung', () => {
    expect(vacationWarning(S, OV)).toBeNull()
  })
  it('V-Schicht am Renntag ohne Urlaub ist ebenfalls ein Konflikt', () => {
    expect(vacationWarning(S, [{ date: '2027-06-18', type: 'V' }])).toMatch(/18\.06\.2027/)
  })
})

describe('Kalenderwochen', () => {
  it('ISO-Wochen korrekt (auch Jahreswechsel)', () => {
    expect(isoWeek('2026-11-16')).toEqual({ year: 2026, week: 47 })
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 })
    expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 })
  })
  it('Wochensummen enthalten alle geplanten Kilometer', () => {
    const w = weeklyTotals(plan)
    const sumWeeks = w.reduce((a, x) => a + x.plannedKm, 0)
    const sumPlan = plan.days.flatMap((d) => d.sessions).filter((s) => s.category === 'run').reduce((a, s) => a + (s.distanceKm ?? 0), 0)
    expect(sumWeeks).toBeCloseTo(sumPlan, 0)
  })
})

describe('.ics', () => {
  it('Export enthält alle Einheiten mit Zeitzone', () => {
    const ics = exportIcs(plan)
    expect(ics).toMatch(/BEGIN:VCALENDAR/)
    expect(ics).toMatch(/DTSTART;TZID=Europe\/Berlin:20270618T230000/)
    const n = plan.days.reduce((a, d) => a + d.sessions.length, 0)
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(n)
  })
  it('Import eines Dienstplans erzeugt nur Abweichungen als Overrides', () => {
    const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Tagdienst', 'DTSTART:20261116T070000', 'DTEND:20261116T190000', 'END:VEVENT', 'BEGIN:VEVENT', 'SUMMARY:V-Schicht', 'DTSTART:20261120T080000', 'END:VEVENT', 'BEGIN:VEVENT', 'SUMMARY:Urlaub', 'DTSTART;VALUE=DATE:20261126', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const ov = icsToOverrides(parseIcs(text), S)
    expect(ov).toEqual([
      { date: '2026-11-20', type: 'V', note: 'aus .ics' },
      { date: '2026-11-26', type: 'URLAUB', note: 'aus .ics' },
    ])
  })
})

describe('Engine und Auswertungen', () => {
  const whoop = sampleWhoop(S, OV, '2026-10-01', '2027-01-10')
  const e = buildEngine({ settings: S, overrides: OV, whoop, today: '2027-01-08', logs: [] })
  it('Tagesansicht: Ampel, Anpassung und Schlafempfehlung', () => {
    const v = dayView(e, '2027-01-07')
    expect(v.assessment.hasData).toBe(true)
    expect(v.sleep).toBeTruthy()
    expect(v.adjusted.length).toBe(v.planDay!.sessions.length)
  })
  it('nach ca. 6 Wochen Daten: gelernte Muster (Recovery nach Nachtschicht niedriger)', () => {
    const p = computePatterns(e.plan.days, e.history)
    expect(p.ready).toBe(true)
    expect(p.effects.afterNightShift.recoveryDelta!).toBeLessThan(0)
    expect(p.learnedNightShiftDrop!).toBeGreaterThan(0)
  })
  it('ohne WHOOP und ohne Eingabe läuft alles fehlerfrei', () => {
    const e2 = buildEngine({ settings: S, overrides: OV, today: '2026-11-17' })
    const v = dayView(e2, '2026-11-17')
    expect(v.assessment.hasData).toBe(false)
    expect(v.adjusted.every((a) => !a.changed)).toBe(true)
  })
})

describe('Erinnerungen', () => {
  it('Nap- und Schlafenszeit-Erinnerung mit Vorlauf', async () => {
    const { upcomingReminders } = await import('../reminders')
    const e = buildEngine({ settings: S, overrides: OV, today: '2026-11-16' })
    const r = upcomingReminders(e, '2026-11-16', 5, { bedtime: true, nap: true }, Date.parse('2026-11-15T00:00:00Z'))
    const nap = r.find((x) => x.id === 'nap:2026-11-17')!
    expect(nap.fireAt).toBe('2026-11-17T13:50:00.000Z') // 14:50 Berlin (MEZ)
    const bed = r.find((x) => x.id === 'bed:2026-11-20')! // Abend vor Tagschicht: 21:45 → Erinnerung 21:15
    expect(bed.fireAt).toBe('2026-11-20T20:15:00.000Z')
    expect(r.some((x) => x.id === 'bed:2026-11-17')).toBe(false) // Nachtschicht: keine Nacht
  })
})
