import { PLAN, RACE, RECOVERY_WEIGHTS, SLEEP_DEFAULTS, VOLUME } from './config'
import { rangeDates } from './dates'
import type { DayOverride, Settings } from './types'

/** Onboarding-Vorbelegung (SPEC 3 + 4, Fragerunde) */
export function defaultSettings(): Settings {
  return {
    profile: {
      weeklyKmStart: 20,
      longestRunKm: 35,
      gym: true,
      calisthenicsPark: true,
      calisthenicsLevel: 'Anfänger (wenige Klimmzüge)',
      goals: ['Muscle-Up', 'Front Lever', 'Back Lever', 'Allgemein stärker werden'],
      maxHr: null,
      easyPace: VOLUME.easyPace,
      longPace: VOLUME.longPace,
    },
    shift: {
      anchorDate: PLAN.anchorDate,
      planStart: PLAN.startDate,
      raceDate: RACE.date,
      commuteMin: 15,
      bufferMin: 0,
      morningRoutineMin: SLEEP_DEFAULTS.morningRoutineMin,
      napStart: SLEEP_DEFAULTS.napStart,
      postNightSleepStart: SLEEP_DEFAULTS.postNightSleep.start,
      postNightSleepEnd: SLEEP_DEFAULTS.postNightSleep.end,
    },
    weights: { ...RECOVERY_WEIGHTS },
    notifications: { bedtime: false, nap: false },
  }
}

/** Genehmigter Urlaub 18.–20.06.2027 (Fragerunde) */
export function defaultOverrides(): DayOverride[] {
  return rangeDates('2027-06-18', '2027-06-20').map((date) => ({
    date,
    type: 'URLAUB' as const,
    note: 'Ehrwald Trail – Urlaub genehmigt',
  }))
}
