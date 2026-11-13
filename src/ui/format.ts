import { PHASE_LABEL, formatDE, formatDuration, formatShortDE, weekdayShort, type Color, type DayKind, type Phase, type Session } from '../core'

export { formatDE, formatShortDE, formatDuration, weekdayShort, PHASE_LABEL }

export const km = (x?: number) => (x === undefined ? '–' : `${x.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`)
export const hm = (x?: number) => (x === undefined || x === 0 ? '' : `${Math.round(x).toLocaleString('de-DE')} hm`)
export const num = (x: number, d = 1) => x.toLocaleString('de-DE', { maximumFractionDigits: d })

export const COLOR_CLASS: Record<Color, string> = {
  green: 'bg-ok text-black',
  yellow: 'bg-warn text-black',
  red: 'bg-bad text-black',
}
export const COLOR_TEXT: Record<Color, string> = { green: 'text-ok', yellow: 'text-warn', red: 'text-bad' }
export const COLOR_HEX: Record<Color, string> = { green: '#34d399', yellow: '#fbbf24', red: '#fb7185' }

export const KIND_CLASS: Record<DayKind, string> = {
  DAY_SHIFT: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  NIGHT_SHIFT: 'bg-indigo-500/25 text-indigo-300 border-indigo-500/40',
  SLEEP_DAY: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  FREE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  VACATION: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  V_SHIFT: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  SICK: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  CUSTOM_WORK: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
}
export const KIND_HEX: Record<DayKind, string> = {
  DAY_SHIFT: '#f59e0b',
  NIGHT_SHIFT: '#6366f1',
  SLEEP_DAY: '#8b5cf6',
  FREE: '#10b981',
  VACATION: '#0ea5e9',
  V_SHIFT: '#f97316',
  SICK: '#f43f5e',
  CUSTOM_WORK: '#71717a',
}

export const PHASE_HEX: Record<Phase, string> = {
  intro: '#94a3b8',
  base: '#38bdf8',
  build: '#a78bfa',
  specific: '#f472b6',
  taper: '#34d399',
  race: '#fbbf24',
}

export function sessionIcon(s: Pick<Session, 'category' | 'type'>): string {
  if (s.type === 'RACE') return '🏁'
  if (s.type === 'NIGHT_RUN') return '🌙'
  if (s.type === 'MOUNTAIN_DAY') return '⛰️'
  if (s.category === 'run') return s.type === 'HILL_TREADMILL' || s.type === 'HILL_INTERVALS' ? '📈' : '🏃'
  if (s.category === 'strength') return s.type.startsWith('LEGS') ? '🦵' : '💪'
  if (s.category === 'test') return '📏'
  return '🧘'
}

export function sessionSummary(s: Session): string {
  const parts = [formatDuration(s.durationMin)]
  if (s.distanceKm) parts.push(km(s.distanceKm))
  if (s.elevationM) parts.push(hm(s.elevationM))
  return parts.join(' · ')
}

export const dateLabel = (d: string) => `${weekdayShort(d)}, ${formatDE(d)}`
