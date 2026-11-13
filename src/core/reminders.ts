/**
 * Erinnerungen (SPEC 6.3b, optional): zur empfohlenen Schlafenszeit und zum Nap.
 * Erzeugt Zeitpunkte für die nächsten Tage; verschickt werden sie serverseitig per Web Push.
 */
import { addDays, addMin, berlinToUtcMs, toMin } from './dates'
import { dayView, type Engine } from './engine'
import type { ISODate } from './types'

export interface Reminder {
  id: string
  fireAt: string
  title: string
  body: string
}

export const REMINDER_LEAD_MIN = { bedtime: 30, nap: 10 } as const

export function upcomingReminders(e: Engine, from: ISODate, days: number, opts: { bedtime: boolean; nap: boolean }, now = Date.now()): Reminder[] {
  const out: Reminder[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    if (!e.days.has(date)) continue
    const v = dayView(e, date)
    if (opts.nap && v.sleep.nap) {
      const t = addMin(v.sleep.nap.start, -REMINDER_LEAD_MIN.nap)
      out.push({ id: `nap:${date}`, fireAt: new Date(berlinToUtcMs(date, t)).toISOString(), title: 'Gleich Nap 😴', body: `Nap ${v.sleep.nap.start}–${v.sleep.nap.end}${v.sleep.departure ? `, Abfahrt ${v.sleep.departure}` : ''}.` })
    }
    if (opts.bedtime && v.sleep.night) {
      const bed = v.sleep.night.start
      // Schlafenszeit nach Mitternacht gehört zum Folgetag
      const bedDate = toMin(bed) < 12 * 60 ? addDays(date, 1) : date
      const t = addMin(bed, -REMINDER_LEAD_MIN.bedtime)
      const tDate = toMin(bed) - REMINDER_LEAD_MIN.bedtime < 0 ? date : bedDate
      out.push({ id: `bed:${date}`, fireAt: new Date(berlinToUtcMs(tDate, t)).toISOString(), title: 'Bald Schlafenszeit 🌙', body: `Empfohlen: ${bed} ins Bett, Aufstehen ${v.sleep.night.end}.` })
    }
  }
  return out.filter((r) => Date.parse(r.fireAt) > now)
}
