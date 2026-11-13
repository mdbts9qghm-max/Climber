/** Frontend-Seite der WHOOP-Anbindung: ruft nur Edge Functions auf, sieht nie Tokens oder Secrets. */
import { functionsUrl, supabase } from './supabase'

async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string } : null
}

export interface WhoopStatus {
  configured: boolean
  loggedIn: boolean
  connected: boolean
  lastSync: string | null
}

export async function whoopStatus(): Promise<WhoopStatus> {
  if (!supabase) return { configured: false, loggedIn: false, connected: false, lastSync: null }
  const h = await authHeader()
  if (!h) return { configured: true, loggedIn: false, connected: false, lastSync: null }
  const { data } = await supabase.rpc('whoop_status')
  const row = Array.isArray(data) ? data[0] : null
  return { configured: true, loggedIn: true, connected: !!row?.connected, lastSync: row?.last_sync_at ?? null }
}

export async function connectWhoop(): Promise<string | null> {
  const h = await authHeader()
  if (!h || !functionsUrl) return 'Bitte zuerst anmelden (Konto & Synchronisation).'
  const res = await fetch(`${functionsUrl}/whoop-auth`, { method: 'POST', headers: h })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.url) return body.error ?? `Fehler ${res.status}`
  location.href = body.url
  return null
}

export async function syncWhoop(opts: { force?: boolean; full?: boolean } = {}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const h = await authHeader()
  if (!h || !functionsUrl) return { ok: false, error: 'nicht angemeldet' }
  const q = new URLSearchParams()
  if (opts.force) q.set('force', '1')
  if (opts.full) q.set('full', '1')
  try {
    const res = await fetch(`${functionsUrl}/whoop-sync?${q}`, { method: 'POST', headers: h })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body.error ?? `Fehler ${res.status}` }
    return { ok: !!body.ok, skipped: body.skipped }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function disconnectWhoop(): Promise<boolean> {
  const h = await authHeader()
  if (!h || !functionsUrl) return false
  const res = await fetch(`${functionsUrl}/whoop-sync?action=disconnect`, { method: 'POST', headers: h })
  return res.ok
}
