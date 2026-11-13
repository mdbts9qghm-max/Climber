/** .ics-Export des Plans und Import eines Dienstplans (SPEC 4.1, 9). */
import { SHIFTS, TIMEZONE } from './config'
import { addDays, addMin, toMin } from './dates'
import { baseShift, cycleDay } from './shifts'
import type { DayOverride, ISODate, Plan, Settings } from './types'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const compact = (d: ISODate) => d.replace(/-/g, '')
const hm = (t: string) => t.replace(':', '') + '00'

function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ' ' + rest.slice(74)
  }
  out.push(rest)
  return out.join('\r\n')
}

export function exportIcs(plan: Plan, opts: { includeShifts?: boolean; stamp?: string } = {}): string {
  const stamp = opts.stamp ?? '20260101T000000Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ehrwald Trainer//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Ehrwald Trail Training`, `X-WR-TIMEZONE:${TIMEZONE}`]
  for (const pd of plan.days) {
    if (opts.includeShifts && pd.day.work) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:shift-${pd.date}@ehrwald-trainer`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TIMEZONE}:${compact(pd.date)}T${hm(pd.day.work.start)}`,
        `DTEND;TZID=${TIMEZONE}:${compact(pd.day.work.endsNextDay ? addDays(pd.date, 1) : pd.date)}T${hm(pd.day.work.end)}`,
        `SUMMARY:${esc(pd.day.label)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      )
    }
    for (const s of pd.sessions) {
      const start = s.startTime ?? pd.day.window?.start ?? '09:00'
      const endMin = toMin(start) + s.durationMin
      const endDate = endMin >= 1440 ? addDays(pd.date, Math.floor(endMin / 1440)) : pd.date
      const desc = [s.goal, ...s.structure.warmup.map((x) => `Aufwärmen: ${x}`), ...s.structure.main, ...s.structure.cooldown.map((x) => `Abwärmen: ${x}`)].join('\n')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${s.id}@ehrwald-trainer`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TIMEZONE}:${compact(pd.date)}T${hm(start)}`,
        `DTEND;TZID=${TIMEZONE}:${compact(endDate)}T${hm(addMin(start, s.durationMin))}`,
        fold(`SUMMARY:${esc(s.title)}`),
        fold(`DESCRIPTION:${esc(desc)}`),
        'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export interface IcsEvent {
  summary: string
  startDate: ISODate
  startTime: string | null
  endDate: ISODate | null
  endTime: string | null
}

/** Minimaler iCalendar-Parser (VEVENT mit DTSTART/DTEND/SUMMARY) */
export function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const events: IcsEvent[] = []
  let cur: Partial<IcsEvent> | null = null
  for (const raw of unfolded.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT' && cur) {
      if (cur.startDate) events.push({ summary: cur.summary ?? '', startDate: cur.startDate, startTime: cur.startTime ?? null, endDate: cur.endDate ?? null, endTime: cur.endTime ?? null })
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const key = line.slice(0, idx).split(';')[0].toUpperCase()
      const val = line.slice(idx + 1)
      if (key === 'SUMMARY') cur.summary = val.replace(/\\,/g, ',').replace(/\;/g, ';')
      if (key === 'DTSTART' || key === 'DTEND') {
        const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
        if (!m) continue
        const date = `${m[1]}-${m[2]}-${m[3]}`
        const time = m[4] ? `${m[4]}:${m[5]}` : null
        if (key === 'DTSTART') {
          cur.startDate = date
          cur.startTime = time
        } else {
          cur.endDate = date
          cur.endTime = time
        }
      }
    }
  }
  return events
}

/**
 * Dienstplan-Events → Overrides. Erkennung über die Startzeit (07:00 T, 19:00 N, 08:00 V)
 * oder Kürzel/Wörter im Titel. Nur Abweichungen vom Grundrhythmus werden übernommen.
 */
export function icsToOverrides(events: IcsEvent[], s: Settings): DayOverride[] {
  const out: DayOverride[] = []
  const classify = (e: IcsEvent): 'T' | 'N' | 'V' | 'U' | 'F' | null => {
    const t = e.summary.toLowerCase()
    if (/urlaub|vacation/.test(t)) return 'U'
    if (/\bfrei\b|\boff\b/.test(t)) return 'F'
    if (/nacht|\bn\b/.test(t) || e.startTime === SHIFTS.N.start || e.startTime === '18:45') return 'N'
    if (/\bv\b|v-schicht/.test(t) || e.startTime === SHIFTS.V.start || e.startTime === '07:45') return 'V'
    if (/tag|\bt\b|früh/.test(t) || e.startTime === SHIFTS.T.start || e.startTime === '06:45') return 'T'
    return null
  }
  for (const e of events) {
    const c = classify(e)
    if (!c) continue
    const base = baseShift(cycleDay(e.startDate, s.shift.anchorDate))
    if (c === 'U') out.push({ date: e.startDate, type: 'URLAUB', note: 'aus .ics' })
    else if (c === 'V') {
      if (base !== 'F') out.push({ date: e.startDate, type: 'TAUSCH', shift: 'V', note: 'aus .ics' })
      else out.push({ date: e.startDate, type: 'V', note: 'aus .ics' })
    } else if (c === 'F') {
      if (base === 'T' || base === 'N') out.push({ date: e.startDate, type: 'TAUSCH', shift: 'F', note: 'aus .ics' })
    } else if (c !== base) out.push({ date: e.startDate, type: 'TAUSCH', shift: c, note: 'aus .ics' })
  }
  return out
}
