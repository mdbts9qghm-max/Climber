import { describe, expect, it } from 'vitest'
import { cycleDay, resolveDays } from '../shifts'
import { addDays, rangeDates } from '../dates'
import { S, OV, day } from './helpers'

const A = '2026-10-02'

describe('Zyklustag-Berechnung', () => {
  it('Ankerdatum, Planstart und Renntag', () => {
    expect(cycleDay('2026-10-02', A)).toBe(1)
    expect(cycleDay('2026-10-03', A)).toBe(2)
    expect(cycleDay('2026-10-06', A)).toBe(5)
    expect(cycleDay('2026-10-07', A)).toBe(1)
    expect(cycleDay('2026-11-12', A)).toBe(2)
    expect(cycleDay('2026-11-13', A)).toBe(3)
    expect(cycleDay('2026-11-16', A)).toBe(1)
    expect(cycleDay('2027-06-18', A)).toBe(5)
    expect(cycleDay('2027-06-19', A)).toBe(1)
  })

  it('läuft über Jahreswechsel und Sommerzeitumstellungen lückenlos weiter', () => {
    for (const [from, to] of [
      ['2026-12-28', '2027-01-04'], // Jahreswechsel
      ['2026-10-22', '2026-10-28'], // Ende Sommerzeit 25.10.2026
      ['2027-03-25', '2027-03-31'], // Beginn Sommerzeit 28.03.2027
    ]) {
      const ds = rangeDates(from, to)
      for (let i = 1; i < ds.length; i++) {
        const prev = cycleDay(ds[i - 1], A)
        expect(cycleDay(ds[i], A)).toBe((prev % 5) + 1)
      }
    }
  })

  it('Datum vor dem Anker funktioniert ebenfalls (mod positiv)', () => {
    expect(cycleDay('2026-10-01', A)).toBe(5)
    expect(cycleDay('2026-09-27', A)).toBe(1)
  })
})

describe('Tagesart und Trainingsfenster', () => {
  it('Grundrhythmus T, N, S, F, F mit harten Fenstern', () => {
    const [t, n, s, f4, f5] = resolveDays('2026-11-16', '2026-11-20', OV, S)
    expect([t.kind, n.kind, s.kind, f4.kind, f5.kind]).toEqual(['DAY_SHIFT', 'NIGHT_SHIFT', 'SLEEP_DAY', 'FREE', 'FREE'])
    expect(t.window).toBeNull()
    expect(t.workStartActual).toBe('06:45')
    expect(n.window).toEqual({ start: '08:00', end: '13:30' })
    expect(n.workStartActual).toBe('18:45')
    expect(s.window?.start).toBe('15:00')
    expect(f4.availability).toBe('full')
    expect(f4.nightRunAllowed).toBe(true) // Tag 5 ist frei
    expect(f5.nightRunAllowed).toBe(false) // danach Tagschicht
  })

  it('V-Schicht an Tag 5: kein Training', () => {
    const d = day('2026-11-20', [{ date: '2026-11-20', type: 'V' }])
    expect(d.kind).toBe('V_SHIFT')
    expect(d.availability).toBe('none')
    expect(d.workStartActual).toBe('07:45')
  })

  it('Urlaub zählt als freier Tag, Schlaftag folgt nur auf eine Nachtschicht', () => {
    const ds = resolveDays('2026-11-16', '2026-11-18', [{ date: '2026-11-17', type: 'URLAUB' }], S)
    expect(ds[1].kind).toBe('VACATION')
    expect(ds[1].availability).toBe('full')
    expect(ds[2].kind).toBe('FREE') // keine Nachtschicht davor → kein Schlaftag
  })

  it('Tausch auf Nachtschicht an Tag 4 macht Tag 5 zum Schlaftag', () => {
    const ds = resolveDays('2026-11-19', '2026-11-20', [{ date: '2026-11-19', type: 'TAUSCH', shift: 'N' }], S)
    expect(ds[0].kind).toBe('NIGHT_SHIFT')
    expect(ds[1].kind).toBe('SLEEP_DAY')
  })

  it('Krank und Fortbildung: kein Training', () => {
    expect(day('2026-11-19', [{ date: '2026-11-19', type: 'KRANK' }]).availability).toBe('none')
    const fb = day('2026-11-19', [{ date: '2026-11-19', type: 'FORTBILDUNG', start: '09:00', end: '17:00' }])
    expect(fb.kind).toBe('CUSTOM_WORK')
    expect(fb.availability).toBe('none')
  })

  it('Renntag 18.06.2027 ist durch den Urlaub frei', () => {
    expect(day('2027-06-18').kind).toBe('VACATION')
    expect(day('2027-06-19').kind).toBe('VACATION')
    expect(day(addDays('2027-06-18', -3)).kind).toBe('NIGHT_SHIFT') // 15.06.
  })
})
