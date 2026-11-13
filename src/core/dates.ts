/**
 * Datumsrechnung. Kalendertage werden über UTC-Mitternacht gerechnet, dadurch spielen
 * Sommerzeitumstellungen keine Rolle. Uhrzeiten sind lokale `HH:MM`-Strings (Europe/Berlin).
 */
import { TIMEZONE } from './config'
import type { HHMM, ISODate } from './types'

const DAY_MS = 86_400_000

export function parseISO(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

export function toISO(ms: number): ISODate {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(parseISO(d) + n * DAY_MS)
}

/** b − a in ganzen Tagen */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS)
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

export function rangeDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** 0 = Montag … 6 = Sonntag */
export function weekdayIndex(d: ISODate): number {
  return mod(new Date(parseISO(d)).getUTCDay() - 1, 7)
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export function weekdayShort(d: ISODate): string {
  return WD[weekdayIndex(d)]
}
export function weekdayLong(d: ISODate): string {
  return WD_LONG[weekdayIndex(d)]
}

/** TT.MM.JJJJ */
export function formatDE(d: ISODate): string {
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}
/** TT.MM. */
export function formatShortDE(d: ISODate): string {
  const [, m, day] = d.split('-')
  return `${day}.${m}.`
}

/** ISO-Kalenderwoche und deren Jahr */
export function isoWeek(d: ISODate): { year: number; week: number } {
  const ms = parseISO(d)
  const wd = weekdayIndex(d) // 0 = Mo
  const thursday = ms + (3 - wd) * DAY_MS
  const year = new Date(thursday).getUTCFullYear()
  const jan4 = Date.UTC(year, 0, 4)
  const jan4wd = mod(new Date(jan4).getUTCDay() - 1, 7)
  const week1Monday = jan4 - jan4wd * DAY_MS
  const week = Math.floor((thursday - week1Monday) / (7 * DAY_MS)) + 1
  return { year, week }
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, -weekdayIndex(d))
}

// ───────────── Uhrzeiten ─────────────

export function toMin(t: HHMM): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Minuten → HH:MM, Werte außerhalb 0..1439 werden umgebrochen */
export function fromMin(min: number): HHMM {
  const v = mod(Math.round(min), 1440)
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

export function addMin(t: HHMM, n: number): HHMM {
  return fromMin(toMin(t) + n)
}

/** Lokale Berlin-Zeit für einen Zeitpunkt */
export function berlinParts(at: Date | string | number): { date: ISODate; time: HHMM; minutes: number } {
  const dt = new Date(at)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(fmt.formatToParts(dt).map((x) => [x.type, x.value]))
  const time = `${p.hour}:${p.minute}`
  return { date: `${p.year}-${p.month}-${p.day}`, time, minutes: toMin(time) }
}

export function todayBerlin(now: Date = new Date()): ISODate {
  return berlinParts(now).date
}

/**
 * Lokale Berlin-Zeit (Datum + HH:MM) → UTC-Zeitstempel in ms.
 * Funktioniert über die Sommerzeitumstellung hinweg (zwei Iterationen).
 */
export function berlinToUtcMs(date: ISODate, time: HHMM): number {
  const guess = parseISO(date) + toMin(time) * 60_000
  let ts = guess
  for (let i = 0; i < 2; i++) {
    const p = berlinParts(ts)
    const shownMs = parseISO(p.date) + p.minutes * 60_000
    ts += guess - shownMs
  }
  return ts
}

/** Lokale Zeit als "absolute Minuten" relativ zu einem Referenzdatum (für Vergleiche über Mitternacht) */
export function absMin(ref: ISODate, date: ISODate, time: HHMM): number {
  return diffDays(ref, date) * 1440 + toMin(time)
}

export function hoursBetween(a: string | number | Date, b: string | number | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000
}

export function formatDuration(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}:${String(r).padStart(2, '0')} h` : `${h} h`
}
