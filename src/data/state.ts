/** App-Zustand (local-first). Wird im localStorage gespeichert und mit Supabase synchronisiert. */
import { defaultOverrides, defaultSettings, initialStrengthState } from '../core'
import type { AdjustmentDecision, DayOverride, ManualRecovery, SessionLog, Settings, StrengthState, StrengthTest } from '../core'

export interface AppState {
  version: 1
  onboarded: boolean
  settings: Settings
  overrides: DayOverride[]
  strength: StrengthState
  strengthTests: StrengthTest[]
  logs: SessionLog[]
  manual: ManualRecovery[]
  decisions: AdjustmentDecision[]
  /** manuelle Korrekturen der Workout-Zuordnung (workoutId → sessionId | null) */
  workoutAssignments: Record<string, string | null>
  checklist: Record<string, boolean>
  /** Beispieldaten statt WHOOP anzeigen */
  demoMode: boolean
  updatedAt: string
}

export function initialState(): AppState {
  return {
    version: 1,
    onboarded: false,
    settings: defaultSettings(),
    overrides: defaultOverrides(),
    strength: initialStrengthState(),
    strengthTests: [],
    logs: [],
    manual: [],
    decisions: [],
    workoutAssignments: {},
    checklist: {},
    demoMode: false,
    updatedAt: new Date(0).toISOString(),
  }
}

/** Fehlende Felder aus älteren Backups ergänzen */
export function normalizeState(raw: unknown): AppState {
  const base = initialState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<AppState>
  return {
    ...base,
    ...r,
    settings: {
      ...base.settings,
      ...(r.settings ?? {}),
      profile: { ...base.settings.profile, ...(r.settings?.profile ?? {}) },
      shift: { ...base.settings.shift, ...(r.settings?.shift ?? {}) },
      weights: { ...base.settings.weights, ...(r.settings?.weights ?? {}) },
      notifications: { ...base.settings.notifications, ...(r.settings?.notifications ?? {}) },
    },
    strength: { ...base.strength, ...(r.strength ?? {}) },
    version: 1,
  }
}
