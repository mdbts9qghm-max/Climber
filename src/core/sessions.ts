/**
 * Bausteine für Einheiten. Jede Einheit enthält Typ, Ziel in einem Satz, Dauer/km, Höhenmeter,
 * Intensität, Ablauf (Aufwärmen/Hauptteil/Abwärmen) und bei Kraft die Übungen (SPEC 9).
 */
import { STRENGTH, TREADMILL, VOLUME } from './config'
import { PROGRESSIONS, PROGRESSION_IDS, nextStageOf, stageOf } from './strength'
import type { Category, Exercise, ISODate, Phase, ProgressionId, Session, SessionType, Sensitivity, Settings, StrengthState } from './types'

export interface BuildCtx {
  date: ISODate
  slot: string
  phase: Phase
  settings: Settings
  strength: StrengthState
}

const r1 = (x: number) => Math.round(x * 10) / 10
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5)
const r10 = (x: number) => Math.round(x / 10) * 10

export const SENSITIVITY: Record<SessionType, Sensitivity> = {
  HILL_INTERVALS: 'high',
  THRESHOLD: 'high',
  LEGS_HEAVY: 'high',
  LEGS_ECCENTRIC: 'high',
  STRENGTH_TEST: 'high',
  LONG_RUN: 'medium',
  B2B_RUN: 'medium',
  NIGHT_RUN: 'medium',
  MOUNTAIN_DAY: 'medium',
  HILL_TREADMILL: 'medium',
  STAIRS: 'medium',
  CALI_MAIN: 'medium',
  LEGS_MAINT: 'medium',
  EASY_RUN: 'low',
  RECOVERY_RUN: 'low',
  SHAKEOUT: 'low',
  MOBILITY: 'low',
  CALI_SKILL: 'low',
  RACE: 'high',
}

export const KEY_TYPES: SessionType[] = ['LONG_RUN', 'B2B_RUN', 'NIGHT_RUN', 'MOUNTAIN_DAY', 'HILL_INTERVALS', 'THRESHOLD', 'STRENGTH_TEST', 'RACE']
/** Rangfolge für Verschiebungen: höherer Wert verdrängt niedrigeren */
export const KEY_PRIORITY: Partial<Record<SessionType, number>> = {
  RACE: 10,
  MOUNTAIN_DAY: 6,
  LONG_RUN: 5,
  NIGHT_RUN: 5,
  B2B_RUN: 3,
  HILL_INTERVALS: 2,
  THRESHOLD: 2,
  STRENGTH_TEST: 2,
}
export const QUALITY_TYPES: SessionType[] = ['HILL_INTERVALS', 'THRESHOLD']
export const HEAVY_LEG_TYPES: SessionType[] = ['LEGS_HEAVY', 'LEGS_ECCENTRIC']
export const LONG_TYPES: SessionType[] = ['LONG_RUN', 'NIGHT_RUN', 'MOUNTAIN_DAY', 'B2B_RUN']

export const TYPE_LABEL: Record<SessionType, string> = {
  LONG_RUN: 'Langer Lauf',
  B2B_RUN: 'Back-to-back-Lauf',
  NIGHT_RUN: 'Nachtlauf',
  MOUNTAIN_DAY: 'Bergtag',
  EASY_RUN: 'Lockerer Lauf',
  RECOVERY_RUN: 'Regenerationslauf',
  HILL_INTERVALS: 'Bergauf-Intervalle',
  THRESHOLD: 'Schwellenlauf',
  HILL_TREADMILL: 'Höhenmeter-Einheit',
  STAIRS: 'Treppen/Stairmaster',
  SHAKEOUT: 'Lockeres Auslaufen',
  CALI_MAIN: 'Calisthenics-Hauptsession',
  CALI_SKILL: 'Leichtes Skill-Training',
  LEGS_HEAVY: 'Beinkraft (schwer)',
  LEGS_ECCENTRIC: 'Beinkraft exzentrisch',
  LEGS_MAINT: 'Beinkraft Erhaltung',
  MOBILITY: 'Mobility',
  STRENGTH_TEST: 'Krafttest',
  RACE: 'Rennen',
}

const CATEGORY: Record<SessionType, Category> = {
  LONG_RUN: 'run', B2B_RUN: 'run', NIGHT_RUN: 'run', MOUNTAIN_DAY: 'run', EASY_RUN: 'run', RECOVERY_RUN: 'run',
  HILL_INTERVALS: 'run', THRESHOLD: 'run', HILL_TREADMILL: 'run', STAIRS: 'run', SHAKEOUT: 'run',
  CALI_MAIN: 'strength', CALI_SKILL: 'strength', LEGS_HEAVY: 'strength', LEGS_ECCENTRIC: 'strength', LEGS_MAINT: 'strength',
  MOBILITY: 'mobility', STRENGTH_TEST: 'test', RACE: 'race',
}

function make(ctx: BuildCtx, type: SessionType, p: Omit<Session, 'id' | 'date' | 'type' | 'category' | 'sensitivity' | 'key'> & { key?: boolean }): Session {
  return {
    id: `${ctx.date}:${ctx.slot}`,
    date: ctx.date,
    type,
    category: CATEGORY[type],
    sensitivity: SENSITIVITY[type],
    key: p.key ?? KEY_TYPES.includes(type),
    ...p,
  }
}

export function runDuration(km: number, hm: number, pace: number): number {
  return r5(km * pace + (hm / 100) * VOLUME.minPer100Hm)
}

function fuelingFor(phase: Phase, durationMin: number): string | undefined {
  if (durationMin < VOLUME.fuelingFromMin) return undefined
  if (phase === 'build') return VOLUME.carbsPerHour.build
  if (phase === 'specific') return VOLUME.carbsPerHour.specific
  if (phase === 'taper') return VOLUME.carbsPerHour.taper
  return undefined
}

const fuelingSteps = (carbs?: string) => (carbs ? [`Verpflegungstraining: ${carbs} Kohlenhydrate pro Stunde, alle 20–30 min essen/trinken und protokollieren`] : [])

// ───────────── Laufen ─────────────

export function easyRun(ctx: BuildCtx, km: number, opts: { abc?: boolean; hm?: number; optional?: boolean } = {}): Session {
  const hm = opts.hm ?? 0
  const d = runDuration(km, hm, ctx.settings.profile.easyPace)
  return make(ctx, 'EASY_RUN', {
    title: `Lockerer Lauf ${r1(km)} km`,
    goal: opts.abc ? 'Aerobe Grundlage aufbauen und Laufökonomie mit Lauf-ABC verbessern.' : 'Aerobe Grundlage aufbauen, ohne zu ermüden.',
    durationMin: d + (opts.abc ? 10 : 0),
    distanceKm: r1(km),
    elevationM: hm,
    intensity: { level: 1, rpe: 'RPE 3–4 (Gesprächstempo)', zone: 'Zone 2' },
    structure: {
      warmup: ['5 min zügig gehen, dann locker einlaufen'],
      main: [
        `${r1(km)} km locker, Nasenatmung möglich`,
        ...(hm > 0 ? [`davon ca. ${hm} hm: ${Math.max(10, Math.round(hm / 40))} min Laufband mit ${TREADMILL.inclinePct[ctx.phase]} % Steigung zügig gehen`] : []),
        ...(opts.abc ? ['10 min Lauf-ABC (Skippings, Anfersen, Hopserlauf) + 4 × 20 s Steigerungen'] : [])],
      cooldown: ['5 min auslaufen/gehen, Waden und Hüftbeuger dehnen'],
    },
    optional: opts.optional,
  })
}

export function recoveryRun(ctx: BuildCtx, km: number): Session {
  return make(ctx, 'RECOVERY_RUN', {
    title: `Regenerationslauf ${r1(km)} km`,
    goal: 'Durchblutung fördern und Beine lockern – nur bei guter Erholung.',
    durationMin: runDuration(km, 0, ctx.settings.profile.easyPace + 0.5),
    distanceKm: r1(km),
    elevationM: 0,
    intensity: { level: 0, rpe: 'RPE 2–3 (sehr locker)', zone: 'Zone 1' },
    structure: { warmup: ['5 min gehen'], main: [`${r1(km)} km sehr locker, jederzeit Gehpausen erlaubt`], cooldown: ['5 min Mobility für Hüfte und Sprunggelenke'] },
    optional: true,
  })
}

export function longRun(ctx: BuildCtx, km: number, opts: { night?: boolean; startTime?: string } = {}): Session {
  const hm = r10(km * VOLUME.flatLongHmPerKm * (ctx.phase === 'base' || ctx.phase === 'intro' ? 0.5 : 1))
  const d = runDuration(km, hm, ctx.settings.profile.longPace)
  const carbs = fuelingFor(ctx.phase, d)
  const gear = ctx.phase === 'build' || ctx.phase === 'specific'
  const type: SessionType = opts.night ? 'NIGHT_RUN' : 'LONG_RUN'
  return make(ctx, type, {
    title: `${opts.night ? 'Nachtlauf' : 'Langer Lauf'} ${r1(km)} km`,
    goal: opts.night
      ? 'Lange Zeit auf den Beinen in der Dunkelheit – Stirnlampe, Orientierung und Müdigkeit wie im Rennen.'
      : 'Ausdauer und Zeit auf den Beinen für 86 km aufbauen.',
    durationMin: d,
    distanceKm: r1(km),
    elevationM: hm,
    intensity: { level: 1, rpe: 'RPE 3–4, Steigungen gehen', zone: 'Zone 1–2' },
    structure: {
      warmup: ['Erste 15 min bewusst sehr locker'],
      main: [
        `${r1(km)} km gleichmäßig locker`,
        hm > 0 ? `ca. ${hm} hm über Brücken, Deiche, Treppen oder Parkhaus – bergauf zügig gehen wie im Rennen` : 'Flach, gleichmäßig',
        ...fuelingSteps(carbs),
        ...(opts.night ? ['Stirnlampe + Ersatzakku testen, reflektierende Kleidung, Strecke vorher planen'] : []),
      ],
      cooldown: ['10 min gehen, danach Kohlenhydrate + Eiweiß, Beine hochlegen'],
    },
    fueling: carbs,
    gearTest: gear,
    timeOfDay: opts.night ? 'night' : 'morning',
    startTime: opts.startTime,
  })
}

export function b2bRun(ctx: BuildCtx, km: number): Session {
  const incline = TREADMILL.inclinePct[ctx.phase]
  const hm = r10(km * VOLUME.flatLongHmPerKm + (ctx.phase === 'specific' ? km * 0.3 * incline * 10 * 0.5 : 0))
  const d = runDuration(km, hm, ctx.settings.profile.longPace)
  const carbs = fuelingFor(ctx.phase, d)
  return make(ctx, 'B2B_RUN', {
    title: `Back-to-back ${r1(km)} km`,
    goal: 'Auf vorermüdeten Beinen laufen – simuliert die zweite Rennhälfte.',
    durationMin: d,
    distanceKm: r1(km),
    elevationM: hm,
    intensity: { level: 1, rpe: 'RPE 3–4, konsequent locker', zone: 'Zone 1–2' },
    structure: {
      warmup: ['10 min gehen/locker – die Beine sind vom Vortag müde, das ist gewollt'],
      main: [
        `${r1(km)} km locker`,
        ctx.phase === 'specific' ? `davon ca. 30 % auf dem Laufband mit ${incline} % Steigung (gehen mit Stöcken/Rucksack)` : 'Steigungen gehen',
        ...fuelingSteps(carbs),
      ],
      cooldown: ['10 min gehen, Mobility'],
    },
    fueling: carbs,
    gearTest: true,
    timeOfDay: 'morning',
  })
}

export function mountainDay(ctx: BuildCtx, km: number, day: 1 | 2): Session {
  const hm = r10(km * (day === 1 ? 65 : 55))
  const d = day === 1 ? Math.max(runDuration(km, hm, ctx.settings.profile.longPace + 2), VOLUME.mountainDayHours[0] * 60) : runDuration(km, hm, ctx.settings.profile.longPace + 2)
  const carbs = fuelingFor(ctx.phase === 'intro' ? 'build' : ctx.phase, d)
  return make(ctx, 'MOUNTAIN_DAY', {
    title: day === 1 ? `Bergtag ${Math.round(d / 60)} h (Generalprobe)` : `Bergtag 2 – ${r1(km)} km`,
    goal: day === 1 ? 'Echte Berge: lange bergauf gehen, technisch bergab laufen, komplette Rennausrüstung testen.' : 'Zweiter Bergtag auf müden Beinen – Bergab-Belastung und Regeneration über Nacht testen.',
    durationMin: d,
    distanceKm: r1(km),
    elevationM: hm,
    intensity: { level: 1, rpe: 'RPE 3–5, bergauf gehen', zone: 'Zone 1–2 (bergauf bis Zone 3 erlaubt)' },
    structure: {
      warmup: ['Erste Stunde bewusst langsam, Stöcke einstellen'],
      main: [`${r1(km)} km mit ca. ${hm} hm`, 'Bergab locker und kontrolliert – Quadrizeps schonen', ...fuelingSteps(carbs), 'Pflichtausrüstung komplett mitnehmen und testen'],
      cooldown: ['Auslaufen/gehen, viel trinken, früh schlafen'],
    },
    fueling: carbs,
    gearTest: true,
    timeOfDay: 'morning',
  })
}

export function hillIntervals(ctx: BuildCtx, km: number): Session {
  const incline = Math.max(10, TREADMILL.inclinePct[ctx.phase])
  const reps = ctx.phase === 'specific' ? 6 : ctx.phase === 'build' ? 5 : 4
  const work = ctx.phase === 'specific' ? 4 : 3
  const intervalKm = reps * work * 0.12
  const hm = r10(intervalKm * incline * 10)
  return make(ctx, 'HILL_INTERVALS', {
    title: `Bergauf-Intervalle ${reps} × ${work} min`,
    goal: 'Kraftausdauer bergauf und VO2max verbessern.',
    durationMin: r5(20 + reps * (work + 2) + 10),
    distanceKm: r1(Math.max(km, intervalKm + 3)),
    elevationM: hm,
    treadmill: { inclinePct: incline, km: r1(intervalKm) },
    intensity: { level: 3, rpe: 'RPE 8 in den Belastungen', zone: 'Zone 4' },
    structure: {
      warmup: ['15 min locker einlaufen', '3 × 20 s Steigerungen'],
      main: [`${reps} × ${work} min Laufband ${incline} % hart (RPE 8)`, '2 min Trabpause oder zügig gehen bei 0–3 %'],
      cooldown: ['10 min auslaufen'],
    },
  })
}

export function threshold(ctx: BuildCtx, km: number): Session {
  const blocks = ctx.phase === 'taper' ? 2 : 3
  const min = ctx.phase === 'taper' ? 6 : 10
  return make(ctx, 'THRESHOLD', {
    title: `Schwellenlauf ${blocks} × ${min} min`,
    goal: 'Laktatschwelle anheben, damit das Renntempo sparsamer wird.',
    durationMin: r5(15 + blocks * (min + 3) + 10),
    distanceKm: r1(Math.max(km, 6)),
    elevationM: 0,
    intensity: { level: 2, rpe: 'RPE 7 (angenehm hart)', zone: 'Zone 3–4' },
    structure: {
      warmup: ['15 min locker einlaufen'],
      main: [`${blocks} × ${min} min an der Schwelle (gerade noch kurze Sätze möglich)`, '3 min locker traben dazwischen'],
      cooldown: ['10 min auslaufen'],
    },
  })
}

export function hillTreadmill(ctx: BuildCtx, km: number): Session {
  const incline = TREADMILL.inclinePct[ctx.phase]
  const inclineKm = km * VOLUME.treadmillInclineShare
  const hm = r10(inclineKm * incline * 10)
  return make(ctx, 'HILL_TREADMILL', {
    title: `Höhenmeter-Einheit ${hm} hm`,
    goal: 'Höhenmeter im Flachland sammeln: steiles Gehen und Laufen wie im Rennen.',
    durationMin: runDuration(km, hm, ctx.settings.profile.easyPace + 2),
    distanceKm: r1(km),
    elevationM: hm,
    treadmill: { inclinePct: incline, km: r1(inclineKm) },
    intensity: { level: 1, rpe: 'RPE 4–6', zone: 'Zone 2–3' },
    structure: {
      warmup: ['10 min locker bei 1–3 %'],
      main: [
        `${r1(inclineKm)} km bei ${incline} % Steigung: 4 min zügig gehen / 2 min laufen im Wechsel`,
        ctx.phase === 'specific' || ctx.phase === 'build' ? 'Mit Stöcken und Rennrucksack (2–4 kg)' : 'Hände nicht auf das Geländer',
        'Alternative: Stairmaster, Treppenhaus oder Parkhaus mit gleicher Zeit',
      ],
      cooldown: ['5 min flach auslaufen, Waden dehnen'],
    },
  })
}

export function shakeout(ctx: BuildCtx, min: number, note?: string): Session {
  return make(ctx, 'SHAKEOUT', {
    title: `Lockeres Auslaufen ${min} min`,
    goal: note ?? 'Beine lockern, Rhythmus halten.',
    durationMin: min,
    distanceKm: r1(min / ctx.settings.profile.easyPace),
    elevationM: 0,
    intensity: { level: 0, rpe: 'RPE 2–3' },
    structure: { warmup: [], main: [`${min} min sehr locker`, '3 × 15 s Steigerungen'], cooldown: ['Kurz dehnen'] },
  })
}

export function race(ctx: BuildCtx): Session {
  return make(ctx, 'RACE', {
    title: 'Ehrwald Trail – 86 km / 4.295 hm',
    goal: 'Gesund und im Zeitlimit (22 h) ins Ziel kommen.',
    durationMin: 22 * 60,
    distanceKm: 86,
    elevationM: 4295,
    intensity: { level: 1, rpe: 'Bewusst langsam starten, bergauf gehen' },
    structure: {
      warmup: ['Nap am Nachmittag, letzte Mahlzeit ca. 3 h vor dem Start'],
      main: ['Start 23:00 Ehrwald', 'Verpflegung nach Plan ab der ersten Stunde', 'Bergab kontrolliert, Kräfte für die zweite Hälfte sparen'],
      cooldown: ['Zielschluss Sa 21:00'],
    },
    startTime: '23:00',
    timeOfDay: 'night',
  })
}

// ───────────── Kraft ─────────────

function caliExercises(ctx: BuildCtx, mode: 'full' | 'maint' | 'short', allowAttempts = true): Exercise[] {
  const ids: ProgressionId[] = mode === 'short' ? ['pull', 'push', 'core'] : PROGRESSION_IDS
  const out: Exercise[] = []
  for (const id of ids) {
    const stage = stageOf(ctx.strength, id)
    const sets = mode === 'full' ? stage.sets : Math.max(2, stage.sets - (mode === 'short' ? 2 : 1))
    out.push({
      name: stage.name,
      sets,
      reps: stage.reps,
      holdSec: stage.holdSec,
      restSec: stage.holdSec ? STRENGTH.restSec.skill : STRENGTH.restSec.strength,
      note: `Kriterium: ${stage.criteria}${stage.cue ? ` · ${stage.cue}` : ''}`,
      progression: id,
    })
    const nxt = nextStageOf(ctx.strength, id)
    if (allowAttempts && mode === 'full' && nxt && ctx.strength.streak[id] >= STRENGTH.sessionsMeetingCriteria - 1) {
      out.push({
        name: `Versuch: ${nxt.name}`,
        sets: 2,
        reps: nxt.reps ? Math.max(1, Math.ceil(nxt.reps / 2)) : undefined,
        holdSec: nxt.holdSec ? Math.max(3, Math.ceil(nxt.holdSec / 2)) : undefined,
        restSec: STRENGTH.restSec.skill,
        note: 'Neue Stufe antesten – nur sauber, sonst abbrechen',
        progression: id,
        attempt: true,
      })
    }
  }
  return out
}

export function caliMain(ctx: BuildCtx, mode: 'full' | 'maint' | 'short' = 'full'): Session {
  const ex = caliExercises(ctx, mode)
  const title = mode === 'full' ? 'Calisthenics-Hauptsession' : mode === 'maint' ? 'Calisthenics Erhaltung' : 'Calisthenics kurz'
  return make(ctx, 'CALI_MAIN', {
    title,
    goal:
      mode === 'full'
        ? `Kraft und Skills aufbauen – Ziele: ${PROGRESSIONS.pull.goal}, Front Lever, Back Lever.`
        : 'Kraftniveau halten, ohne die Laufbeine zu belasten.',
    durationMin: mode === 'full' ? 70 : mode === 'maint' ? 45 : 30,
    intensity: { level: 2, rpe: 'RPE 7–8, saubere Wiederholungen' },
    structure: {
      warmup: ['5 min Handgelenke/Schultern mobilisieren', '2 × 10 Scapula-Pushups, 2 × 10 Scapula-Pulls', '30 s aktives Hängen'],
      main: ex.map((e) => exerciseLine(e)),
      cooldown: ['Brust/Lat dehnen, 5 min'],
    },
    exercises: ex,
    timeOfDay: 'morning',
  })
}

export function caliSkill(ctx: BuildCtx): Session {
  const fl = stageOf(ctx.strength, 'frontLever')
  const bl = stageOf(ctx.strength, 'backLever')
  const ex: Exercise[] = [
    { name: 'Aktives Hängen', sets: 3, holdSec: 20, restSec: 60 },
    { name: `${fl.name} (locker)`, sets: 3, holdSec: Math.max(5, Math.round((fl.holdSec ?? 10) * 0.6)), restSec: 90, progression: 'frontLever' },
    { name: `${bl.name} (locker)`, sets: 2, holdSec: Math.max(5, Math.round((bl.holdSec ?? 10) * 0.6)), restSec: 90, progression: 'backLever' },
    { name: 'Hollow Body Hold', sets: 2, holdSec: 20, restSec: 60, progression: 'core' },
  ]
  return make(ctx, 'CALI_SKILL', {
    title: 'Leichtes Skill-Training',
    goal: 'Technik und Positionen üben, ohne zu ermüden.',
    durationMin: 25,
    intensity: { level: 0, rpe: 'RPE 4–5, weit weg vom Versagen' },
    structure: { warmup: ['Schultern/Handgelenke mobilisieren'], main: ex.map(exerciseLine), cooldown: ['Kurz dehnen'] },
    exercises: ex,
    optional: true,
  })
}

const LEGS: Record<'heavy' | 'eccentric' | 'maint' | 'technical', Exercise[]> = {
  heavy: [
    { name: 'Kniebeuge (Goblet oder Langhantel)', sets: 4, reps: 6, restSec: 150, note: 'RPE 7–8, saubere Tiefe' },
    { name: 'Bulgarische Split Squats', sets: 3, reps: 8, restSec: 90, note: 'je Seite' },
    { name: 'Rumänisches Kreuzheben (moderat)', sets: 3, reps: 8, restSec: 120, note: 'RPE 7, Rücken neutral' },
    { name: 'Step-ups auf Kasten (kniehoch)', sets: 3, reps: 10, restSec: 75, note: 'je Seite, mit Kurzhanteln' },
    { name: 'Wadenheben einbeinig', sets: 3, reps: 15, restSec: 60 },
    { name: 'Nordic Curls (negativ)', sets: 3, reps: 4, restSec: 90 },
  ],
  eccentric: [
    { name: 'Tempo-Kniebeugen (4 s ablassen)', sets: 4, reps: 6, restSec: 150, note: 'Bergab-Vorbereitung' },
    { name: 'Step-downs (langsam, 3 s)', sets: 3, reps: 10, restSec: 75, note: 'je Seite, Knie über dem Fuß' },
    { name: 'Bulgarische Split Squats (3 s ablassen)', sets: 3, reps: 8, restSec: 90, note: 'je Seite' },
    { name: 'Nordic Curls (negativ)', sets: 3, reps: 5, restSec: 90 },
    { name: 'Wadenheben exzentrisch einbeinig', sets: 3, reps: 12, restSec: 60 },
    { name: 'Copenhagen Plank', sets: 2, holdSec: 20, restSec: 60, note: 'je Seite' },
  ],
  maint: [
    { name: 'Kniebeuge (moderat)', sets: 2, reps: 6, restSec: 120, note: 'RPE 6–7' },
    { name: 'Step-downs', sets: 2, reps: 10, restSec: 60, note: 'je Seite' },
    { name: 'Rumänisches Kreuzheben (leicht)', sets: 2, reps: 8, restSec: 90 },
    { name: 'Wadenheben einbeinig', sets: 2, reps: 15, restSec: 60 },
  ],
  technical: [
    { name: 'Kniebeuge (leicht, Technik)', sets: 3, reps: 6, restSec: 90, note: 'RPE 5–6' },
    { name: 'Step-downs', sets: 2, reps: 8, restSec: 60, note: 'je Seite, langsam' },
    { name: 'Wadenheben', sets: 2, reps: 15, restSec: 60 },
  ],
}

export function legs(ctx: BuildCtx, kind: 'heavy' | 'eccentric' | 'maint'): Session {
  const type: SessionType = kind === 'heavy' ? 'LEGS_HEAVY' : kind === 'eccentric' ? 'LEGS_ECCENTRIC' : 'LEGS_MAINT'
  const ex = LEGS[kind]
  return make(ctx, type, {
    title: TYPE_LABEL[type],
    goal:
      kind === 'heavy'
        ? 'Trail-Robustheit: Beinkraft, Sehnen und Stabilität aufbauen (keine Maximalkraft).'
        : kind === 'eccentric'
          ? 'Quadrizeps und Sehnen auf die Bergab-Belastung von 4.300 hm vorbereiten.'
          : 'Beinkraft erhalten, ohne die Laufeinheiten zu stören.',
    durationMin: kind === 'maint' ? 30 : 55,
    intensity: { level: kind === 'maint' ? 1 : 2, rpe: kind === 'maint' ? 'RPE 6' : 'RPE 7–8' },
    structure: { warmup: ['5 min Rad/Rudern', 'Hüft- und Sprunggelenk-Mobility, 2 Aufwärmsätze'], main: ex.map(exerciseLine), cooldown: ['Hüftbeuger und Waden dehnen'] },
    exercises: ex,
  })
}

/** Abgeschwächte Variante (Gelb / wenig Schlaf): technische Sätze */
export function legsTechnical(base: Session): Session {
  const ex = LEGS.technical
  return {
    ...base,
    type: 'LEGS_MAINT',
    sensitivity: SENSITIVITY.LEGS_MAINT,
    title: 'Beinkraft technisch (leicht)',
    goal: 'Bewegungsmuster üben, keine schweren Sätze.',
    durationMin: 30,
    intensity: { level: 1, rpe: 'RPE 5–6' },
    exercises: ex,
    structure: { ...base.structure, main: ex.map(exerciseLine) },
  }
}

export function mobility(ctx: BuildCtx, min: number, optional = false): Session {
  return make(ctx, 'MOBILITY', {
    title: `Mobility ${min} min`,
    goal: 'Beweglichkeit von Hüfte, Sprunggelenk und Brustwirbelsäule erhalten.',
    durationMin: min,
    intensity: { level: 0, rpe: 'entspannt' },
    structure: {
      warmup: [],
      main: ['90/90 Hüftrotation', 'Knie-zur-Wand (Sprunggelenk)', 'Couch Stretch', 'Thorax-Rotation im Vierfüßlerstand', 'Waden an der Wand'],
      cooldown: [],
    },
    optional,
    timeOfDay: 'evening',
  })
}

export function strengthTest(ctx: BuildCtx): Session {
  const ex: Exercise[] = [
    { name: 'Max. saubere Klimmzüge', sets: 1, restSec: 180, note: 'volle Streckung, Kinn über Stange' },
    { name: 'Max. saubere Dips', sets: 1, restSec: 180, note: 'falls noch keine Dips: max. Liegestütze' },
    { name: 'Hollow Body Hold max.', sets: 1, restSec: 120 },
    { name: `Front Lever: beste Stufe (${stageOf(ctx.strength, 'frontLever').name}) max. Haltezeit`, sets: 1, restSec: 180 },
    { name: `Back Lever: beste Stufe (${stageOf(ctx.strength, 'backLever').name}) max. Haltezeit`, sets: 1, restSec: 180 },
  ]
  return make(ctx, 'STRENGTH_TEST', {
    title: 'Krafttest',
    goal: 'Fortschritt messen – die Ergebnisse steuern die nächsten Progressionsstufen.',
    durationMin: 45,
    intensity: { level: 3, rpe: 'Maximalversuche, nur saubere Wiederholungen zählen' },
    structure: { warmup: ['10 min gründlich aufwärmen, 2 leichte Sätze Klimmzug/Dip'], main: ex.map(exerciseLine), cooldown: ['Ergebnisse in der App eintragen'] },
    exercises: ex,
  })
}

export function exerciseLine(e: Exercise): string {
  const dose = e.reps ? `${e.sets} × ${e.reps}` : e.holdSec ? `${e.sets} × ${e.holdSec} s` : `${e.sets} Satz`
  return `${e.name}: ${dose}, Pause ${Math.round(e.restSec / 15) * 15} s${e.note ? ` (${e.note})` : ''}`
}

// ───────────── Hilfen für Anpassungen ─────────────

/** Läufe in eine lockere Variante umwandeln (z. B. Intervall → lockerer Lauf) */
export function toEasyRun(s: Session, minutes: number, ctxSettings: Settings): Session {
  const km = r1(minutes / ctxSettings.profile.easyPace)
  return {
    ...s,
    type: 'EASY_RUN',
    sensitivity: 'low',
    key: false,
    title: `Lockerer Lauf ${minutes} min`,
    goal: 'Locker bewegen statt Belastung – Erholung hat Vorrang.',
    durationMin: minutes,
    distanceKm: km,
    elevationM: 0,
    treadmill: undefined,
    intensity: { level: 1, rpe: 'RPE 3–4', zone: 'Zone 2' },
    structure: { warmup: ['5 min gehen'], main: [`${minutes} min locker`], cooldown: ['5 min auslaufen'] },
  }
}
