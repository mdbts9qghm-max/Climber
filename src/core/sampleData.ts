/**
 * Beispieldaten statt WHOOP (Phase 2/3, Demo-Modus). Erzeugt realistische Zyklen, Schlaf und
 * Recovery passend zum Schichtplan: Nach Nachtschichten beginnt der Zyklus mit dem Tagschlaf.
 */
import { addDays, berlinToUtcMs, diffDays } from './dates'
import { resolveDays } from './shifts'
import type { DayOverride, ISODate, Settings } from './types'
import type { WhoopCycle, WhoopData, WhoopRecovery, WhoopSleep } from './whoop'

function rng(seed: number) {
  let x = seed || 1
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

export function sampleWhoop(s: Settings, overrides: DayOverride[], from: ISODate, to: ISODate, seed = 42): WhoopData {
  const r = rng(seed)
  const days = resolveDays(from, to, overrides, s)
  const cycles: WhoopCycle[] = []
  const recoveries: WhoopRecovery[] = []
  const sleeps: WhoopSleep[] = []
  let id = 1000
  const push = (startMs: number, endMs: number, base: number, nap = false) => {
    const sleepId = nap ? `nap-${startMs}` : `sleep-${id}`
    const durH = (endMs - startMs) / H
    sleeps.push({
      id: sleepId,
      cycle_id: nap ? undefined : id,
      start: iso(startMs),
      end: iso(endMs),
      nap,
      score_state: 'SCORED',
      score: {
        stage_summary: { total_in_bed_time_milli: durH * H, total_awake_time_milli: 0.08 * durH * H, total_light_sleep_time_milli: 0.5 * durH * H, total_slow_wave_sleep_time_milli: 0.2 * durH * H, total_rem_sleep_time_milli: 0.22 * durH * H },
        sleep_needed: { baseline_milli: 8 * H, need_from_sleep_debt_milli: Math.max(0, (8 - durH) * 0.5) * H, need_from_recent_strain_milli: 0.3 * H, need_from_recent_nap_milli: 0 },
        sleep_performance_percentage: Math.round(Math.min(100, (durH / 8) * 100)),
        sleep_efficiency_percentage: 88 + Math.round(r() * 8),
      },
    })
    if (nap) return
    const score = Math.max(5, Math.min(99, Math.round(base + (r() - 0.5) * 20)))
    cycles.push({ id, start: iso(startMs), end: null, score_state: 'SCORED', score: { strain: Math.round((6 + r() * 10) * 10) / 10 } })
    recoveries.push({ cycle_id: id, sleep_id: sleepId, score_state: 'SCORED', score: { recovery_score: score, resting_heart_rate: Math.round(52 + (60 - score) / 8 + r() * 2), hrv_rmssd_milli: Math.round((45 + (score - 60) / 3 + r() * 4) * 10) / 10 } })
    id++
  }
  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const next = days[i + 1]
    if (d.kind === 'SLEEP_DAY') push(berlinToUtcMs(d.date, '08:05'), berlinToUtcMs(d.date, '13:50'), 45)
    if (d.kind === 'NIGHT_SHIFT') {
      push(berlinToUtcMs(d.date, '15:00'), berlinToUtcMs(d.date, '16:30'), 0, true)
      continue
    }
    if (!next) continue
    const early = next.work && !next.work.endsNextDay
    const bed = early ? '21:50' : '22:40'
    const wake = early ? '05:55' : next.kind === 'NIGHT_SHIFT' ? '07:45' : '07:05'
    push(berlinToUtcMs(d.date, bed), berlinToUtcMs(addDays(d.date, 1), wake), early ? 62 : 70)
  }
  // Zyklen schließen: Ende = Beginn des nächsten Zyklus
  cycles.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  for (let i = 0; i < cycles.length - 1; i++) cycles[i].end = cycles[i + 1].start
  void diffDays
  return { cycles, recoveries, sleeps, workouts: [], maxHr: 190 }
}
