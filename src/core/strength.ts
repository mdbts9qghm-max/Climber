/**
 * Calisthenics-Progressionen (SPEC 5.5). Aufgestiegen wird nur, wenn die Kriterien der
 * aktuellen Stufe erfüllt sind (in STRENGTH.sessionsMeetingCriteria Einheiten in Folge)
 * oder ein Krafttest sie belegt.
 */
import { STRENGTH } from './config'
import type { ISODate, ProgressionId, ProgressionStage, SetResult, StrengthState, StrengthTest } from './types'

const st = (
  name: string,
  sets: number,
  dose: { reps?: number; holdSec?: number },
  criteria: string,
  target: ProgressionStage['target'],
  cue?: string,
): ProgressionStage => ({ name, sets, ...dose, criteria, target, cue })

export const PROGRESSIONS: Record<ProgressionId, { label: string; goal: string; stages: ProgressionStage[] }> = {
  pull: {
    label: 'Klimmzug / Muscle-Up',
    goal: 'Muscle-Up',
    stages: [
      st('Aktives Hängen + Scapula-Pulls', 3, { reps: 8 }, '3 × 30 s aktives Hängen und 3 × 10 Scapula-Pulls', { sets: 3, reps: 10 }, 'Schultern aktiv nach unten ziehen, Arme gestreckt'),
      st('Australian Rows', 3, { reps: 10 }, '3 × 12 saubere Rows (Körper gerade)', { sets: 3, reps: 12 }, 'Brust zur Stange, Körperspannung halten'),
      st('Negativ-Klimmzüge (5 s ablassen)', 3, { reps: 4 }, '3 × 5 Negative mit je 5 s Absenkphase', { sets: 3, reps: 5 }, 'Oben starten (Sprung/Kasten), langsam und kontrolliert ablassen'),
      st('Band-Klimmzüge', 3, { reps: 6 }, '3 × 8 mit leichtem Band', { sets: 3, reps: 8 }, 'Volle Bewegung: gestreckt unten, Kinn über die Stange'),
      st('Strikte Klimmzüge', 4, { reps: 4 }, '3 × 8 strikte Klimmzüge', { sets: 3, reps: 8 }, 'Kein Schwung, volle Streckung unten'),
      st('Klimmzug-Volumen (Ziel 10 am Stück)', 4, { reps: 7 }, '10 saubere Klimmzüge am Stück und 10+ Dips (Krafttest)', { sets: 1, reps: 10 }, 'Sauber vor viel'),
      st('Explosive Klimmzüge (Brust zur Stange)', 5, { reps: 4 }, '4 × 5 Klimmzüge bis Brust/unteres Brustbein', { sets: 4, reps: 5 }, 'Explosiv ziehen, Stange zur Hüfte denken'),
      st('Muscle-Up-Übergang (Band / niedrige Stange)', 5, { reps: 3 }, '4 × 3 saubere Übergänge mit leichtem Band', { sets: 4, reps: 3 }, 'Falscher Griff, Ellbogen schnell nach vorne'),
      st('Muscle-Up', 5, { reps: 2 }, '3 × 3 saubere Muscle-Ups', { sets: 3, reps: 3 }, 'Ziel erreicht – Qualität halten'),
    ],
  },
  push: {
    label: 'Dips / Drücken',
    goal: 'Dips 10+ (Muscle-Up-Voraussetzung)',
    stages: [
      st('Knie-Liegestütze', 3, { reps: 12 }, '3 × 15 saubere Knie-Liegestütze', { sets: 3, reps: 15 }),
      st('Liegestütze', 3, { reps: 8 }, '3 × 12 saubere Liegestütze', { sets: 3, reps: 12 }, 'Ellbogen ca. 45°, Körper als Brett'),
      st('Stütz halten (Barren)', 3, { holdSec: 20 }, '3 × 30 s Stütz mit tiefen Schultern', { sets: 3, holdSec: 30 }),
      st('Negativ-Dips', 3, { reps: 4 }, '3 × 5 Negative mit 5 s Absenkphase', { sets: 3, reps: 5 }),
      st('Dips', 4, { reps: 5 }, '3 × 8 Dips', { sets: 3, reps: 8 }, 'Bis Oberarm parallel, Schultern unten'),
      st('Dips Volumen', 4, { reps: 9 }, '3 × 12 Dips', { sets: 3, reps: 12 }),
      st('Schwere Dips (+5 kg) / Diamond-Liegestütze', 4, { reps: 6 }, '3 × 8 mit +5 kg', { sets: 3, reps: 8 }),
    ],
  },
  frontLever: {
    label: 'Front Lever',
    goal: 'Straddle Front Lever',
    stages: [
      st('Hollow Body Hold', 3, { holdSec: 20 }, '3 × 30 s Hollow Body sauber', { sets: 3, holdSec: 30 }, 'Lendenwirbel am Boden'),
      st('Tuck Front Lever', 4, { holdSec: 8 }, '3 × 15 s Tuck Front Lever', { sets: 3, holdSec: 15 }, 'Arme gestreckt, Schulterblätter nach unten'),
      st('Advanced Tuck Front Lever', 4, { holdSec: 8 }, '3 × 12 s Advanced Tuck', { sets: 3, holdSec: 12 }, 'Rücken flach'),
      st('One Leg Front Lever', 4, { holdSec: 6 }, '3 × 10 s One Leg (je Seite)', { sets: 3, holdSec: 10 }),
      st('Straddle Front Lever', 4, { holdSec: 5 }, '3 × 8 s Straddle', { sets: 3, holdSec: 8 }, 'Ziel erreicht'),
    ],
  },
  backLever: {
    label: 'Back Lever',
    goal: 'One Leg Back Lever',
    stages: [
      st('German Hang', 3, { holdSec: 10 }, '3 × 20 s German Hang entspannt', { sets: 3, holdSec: 20 }, 'Langsam steigern – Schultern brauchen Zeit'),
      st('Skin the Cat', 3, { reps: 3 }, '3 × 5 kontrollierte Skin the Cat', { sets: 3, reps: 5 }),
      st('Tuck Back Lever', 4, { holdSec: 8 }, '3 × 15 s Tuck Back Lever', { sets: 3, holdSec: 15 }),
      st('Advanced Tuck Back Lever', 4, { holdSec: 8 }, '3 × 12 s Advanced Tuck', { sets: 3, holdSec: 12 }),
      st('One Leg Back Lever', 4, { holdSec: 6 }, '3 × 10 s One Leg', { sets: 3, holdSec: 10 }, 'Ziel erreicht'),
    ],
  },
  core: {
    label: 'Core',
    goal: 'L-Sit',
    stages: [
      st('Hollow Body Hold', 3, { holdSec: 20 }, '3 × 30 s Hollow Body', { sets: 3, holdSec: 30 }),
      st('Hanging Knee Raises', 3, { reps: 8 }, '3 × 12 kontrollierte Knee Raises', { sets: 3, reps: 12 }),
      st('Hanging Leg Raises', 3, { reps: 6 }, '3 × 10 Leg Raises (Beine gestreckt)', { sets: 3, reps: 10 }),
      st('Tuck L-Sit', 3, { holdSec: 10 }, '3 × 15 s Tuck L-Sit', { sets: 3, holdSec: 15 }),
      st('One Leg L-Sit', 3, { holdSec: 8 }, '3 × 10 s je Seite', { sets: 3, holdSec: 10 }),
      st('L-Sit', 3, { holdSec: 6 }, '3 × 10 s L-Sit', { sets: 3, holdSec: 10 }, 'Ziel erreicht'),
    ],
  },
}

export const PROGRESSION_IDS: ProgressionId[] = ['pull', 'push', 'frontLever', 'backLever', 'core']

export function initialStrengthState(): StrengthState {
  return {
    stages: { pull: 0, push: 0, frontLever: 0, backLever: 0, core: 0 },
    streak: { pull: 0, push: 0, frontLever: 0, backLever: 0, core: 0 },
    history: [],
  }
}

export function stageOf(state: StrengthState, id: ProgressionId): ProgressionStage {
  const stages = PROGRESSIONS[id].stages
  return stages[Math.min(state.stages[id], stages.length - 1)]
}

export function nextStageOf(state: StrengthState, id: ProgressionId): ProgressionStage | null {
  const stages = PROGRESSIONS[id].stages
  return stages[state.stages[id] + 1] ?? null
}

/** Erfüllt ein Satz-Ergebnis das Kriterium einer Stufe? */
export function meetsCriteria(stage: ProgressionStage, result: SetResult): boolean {
  const t = stage.target
  if (t.reps !== undefined) {
    const good = (result.reps ?? []).filter((r) => r >= t.reps!).length
    return good >= t.sets
  }
  if (t.holdSec !== undefined) {
    const good = (result.holdSec ?? []).filter((h) => h >= t.holdSec!).length
    return good >= t.sets
  }
  return false
}

/** Stufe, für die die Muscle-Up-Voraussetzung gilt (ab "Explosive Klimmzüge") */
const PULL_GATE_STAGE = 5

function canAdvancePull(state: StrengthState, latestTest?: StrengthTest): boolean {
  if (state.stages.pull < PULL_GATE_STAGE) return true
  if (!latestTest) return false
  return latestTest.pullUps >= STRENGTH.muscleUpPrereq.pullUps && latestTest.dips >= STRENGTH.muscleUpPrereq.dips
}

/**
 * Wertet die Sätze einer Einheit aus. Aufstieg erst, wenn die Kriterien in
 * `sessionsMeetingCriteria` Einheiten in Folge erfüllt wurden.
 */
export function applySessionResults(
  state: StrengthState,
  date: ISODate,
  results: SetResult[],
  latestTest?: StrengthTest,
): StrengthState {
  const next: StrengthState = {
    stages: { ...state.stages },
    streak: { ...state.streak },
    history: [...state.history],
  }
  for (const id of PROGRESSION_IDS) {
    const r = results.find((x) => x.progression === id)
    if (!r) continue
    const stage = stageOf(next, id)
    if (!meetsCriteria(stage, r)) {
      next.streak[id] = 0
      continue
    }
    next.streak[id] += 1
    const isLast = next.stages[id] >= PROGRESSIONS[id].stages.length - 1
    // Stufe 5 (Klimmzug-Volumen) hat das Kriterium "10 am Stück + 10 Dips" → nur über Krafttest
    const testOnly = id === 'pull' && next.stages[id] === PULL_GATE_STAGE
    if (!isLast && !testOnly && next.streak[id] >= STRENGTH.sessionsMeetingCriteria && (id !== 'pull' || canAdvancePull(next, latestTest))) {
      next.history.push({ date, progression: id, from: next.stages[id], to: next.stages[id] + 1, reason: `Kriterium erfüllt: ${stage.criteria}` })
      next.stages[id] += 1
      next.streak[id] = 0
    }
  }
  return next
}

/** Stufe aus dem Krafttest ableiten (nur Aufstieg, nie Abstieg ohne Grund) */
export function pullStageFromTest(t: StrengthTest): number {
  if (t.pullUps >= 10 && t.dips >= 10) return 6
  if (t.pullUps >= 8) return 5
  if (t.pullUps >= 3) return 4
  if (t.pullUps >= 1) return 3
  return 1
}
export function pushStageFromTest(t: StrengthTest): number {
  if (t.dips >= 12) return 6
  if (t.dips >= 8) return 5
  if (t.dips >= 3) return 4
  if (t.dips >= 1) return 3
  if ((t.pushUps ?? 0) >= 12) return 2
  if ((t.pushUps ?? 0) >= 5) return 1
  return 0
}

/**
 * Krafttest (SPEC 5.5, alle 35 Tage): Ergebnisse steuern die nächsten Stufen.
 * Eine Stufe steigt nur, wenn der Test das Kriterium der aktuellen Stufe belegt.
 */
export function applyStrengthTest(state: StrengthState, t: StrengthTest): StrengthState {
  const next: StrengthState = { stages: { ...state.stages }, streak: { ...state.streak }, history: [...state.history] }
  const set = (id: ProgressionId, target: number, reason: string) => {
    const max = PROGRESSIONS[id].stages.length - 1
    const to = Math.min(max, target)
    if (to > next.stages[id]) {
      next.history.push({ date: t.date, progression: id, from: next.stages[id], to, reason })
      next.stages[id] = to
      next.streak[id] = 0
    }
  }
  set('pull', pullStageFromTest(t), `Krafttest: ${t.pullUps} Klimmzüge, ${t.dips} Dips`)
  set('push', pushStageFromTest(t), `Krafttest: ${t.dips} Dips`)
  // Lever: Teststufe gehalten ≥ Kriterium der Stufe → nächste Stufe
  const lever = (id: 'frontLever' | 'backLever', stage: number, hold: number) => {
    const s = PROGRESSIONS[id].stages[stage]
    if (s && s.target.holdSec !== undefined && hold >= s.target.holdSec) set(id, stage + 1, `Krafttest: ${s.name} ${hold} s gehalten`)
    else if (stage > next.stages[id]) set(id, stage, `Krafttest: ${s?.name ?? 'Stufe'} ${hold} s`)
  }
  lever('frontLever', t.frontLeverStage, t.frontLeverHoldSec)
  lever('backLever', t.backLeverStage, t.backLeverHoldSec)
  if (t.hollowHoldSec >= 30) set('core', 1, `Krafttest: Hollow Body ${t.hollowHoldSec} s`)
  if (t.hollowHoldSec >= 30 && next.stages.frontLever === 0) set('frontLever', 1, `Krafttest: Hollow Body ${t.hollowHoldSec} s`)
  return next
}

/** Nächstes Ziel je Progression in Worten */
export function nextGoal(state: StrengthState, id: ProgressionId): string {
  const stage = stageOf(state, id)
  const nxt = nextStageOf(state, id)
  if (!nxt) return `Endstufe erreicht: ${stage.name}`
  return `${stage.criteria} → ${nxt.name}`
}
