/** Lokale Speicherung im Browser (offline-fähig). */
import type { WhoopData } from '../core'
import { normalizeState, type AppState } from './state'

const KEY = 'ehrwald-trainer:state'
const WHOOP_KEY = 'ehrwald-trainer:whoop'

export function loadLocal(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    return normalizeState(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeState(null)
  }
}

export function saveLocal(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* Speicher voll oder privat – App läuft trotzdem */
  }
}

export function loadWhoopCache(): WhoopData | null {
  try {
    const raw = localStorage.getItem(WHOOP_KEY)
    return raw ? (JSON.parse(raw) as WhoopData) : null
  } catch {
    return null
  }
}

export function saveWhoopCache(d: WhoopData | null): void {
  try {
    if (d) localStorage.setItem(WHOOP_KEY, JSON.stringify(d))
    else localStorage.removeItem(WHOOP_KEY)
  } catch {
    /* ignore */
  }
}

export function clearLocal(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(WHOOP_KEY)
}
