/**
 * Remote-Synchronisation. Phase 3: nur lokal. Phase 4 ersetzt das durch Supabase.
 */
import type { WhoopData } from '../core'
import type { AppState } from './state'

export interface Remote {
  init(onStatus: (s: string) => void): Promise<AppState | null>
  push(s: AppState): Promise<string | null>
  fetchWhoop(): Promise<WhoopData | null>
}

export const remote: Remote = {
  async init() {
    return null
  },
  async push() {
    return null
  },
  async fetchWhoop() {
    return null
  },
}
