/**
 * WHOOP Developer API v2 – OAuth, Token-Refresh, paginierter Abruf, Speicherung.
 * Läuft ausschließlich serverseitig: Client Secret und Tokens verlassen nie die Edge Function.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
export const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
export const WHOOP_API = 'https://api.prod.whoop.com/developer'
export const SCOPES = 'offline read:profile read:recovery read:sleep read:cycles read:workout read:body_measurement'

/** Erster Abruf: so viele Tage zurück (Baselines für HRV/Ruhepuls) */
export const INITIAL_DAYS = 60
/** Inkrementeller Abruf: Überlappung, damit nachträglich gescorte Daten aktualisiert werden */
export const OVERLAP_DAYS = 3

export function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt`)
  return v
}

export function redirectUri(): string {
  return `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/whoop-callback`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type: string
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('WHOOP_CLIENT_ID'), client_secret: env('WHOOP_CLIENT_SECRET'), ...params }),
  })
  if (!res.ok) throw new Error(`WHOOP Token-Fehler ${res.status}: ${await res.text()}`)
  return (await res.json()) as TokenResponse
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() })
}

export interface Connection {
  user_id: string
  whoop_user_id: number | null
  access_token: string
  refresh_token: string | null
  expires_at: string
  scope: string | null
  last_sync_at: string | null
}

export async function saveTokens(db: SupabaseClient, userId: string, t: TokenResponse, whoopUserId?: number | null, prevRefresh?: string | null) {
  const row = {
    user_id: userId,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? prevRefresh ?? null,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    scope: t.scope ?? SCOPES,
    updated_at: new Date().toISOString(),
    ...(whoopUserId !== undefined ? { whoop_user_id: whoopUserId } : {}),
  }
  const { error } = await db.from('whoop_connections').upsert(row, { onConflict: 'user_id' })
  if (error) throw error
}

/** Gültiges Access-Token liefern, bei Bedarf per Refresh-Token erneuern */
export async function validToken(db: SupabaseClient, conn: Connection): Promise<string> {
  if (Date.parse(conn.expires_at) > Date.now() + 60_000) return conn.access_token
  if (!conn.refresh_token) throw new Error('Kein Refresh-Token – bitte WHOOP neu verbinden')
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token, scope: 'offline' })
  await saveTokens(db, conn.user_id, t, undefined, conn.refresh_token)
  return t.access_token
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET mit Rate-Limit-Behandlung (429 → Retry-After abwarten, max. 3 Versuche) */
export async function whoopGet<T>(token: string, path: string, query: Record<string, string> = {}): Promise<T> {
  const url = new URL(WHOOP_API + path)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('Retry-After') ?? '5')
      await sleep(Math.min(60, wait) * 1000)
      continue
    }
    if (res.status === 404) return null as T
    if (!res.ok) throw new Error(`WHOOP ${path} ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }
}

interface Page<T> {
  records: T[]
  next_token?: string | null
}

export async function fetchAll<T>(token: string, path: string, start: string, end?: string): Promise<T[]> {
  const out: T[] = []
  let next: string | undefined
  for (let i = 0; i < 100; i++) {
    const q: Record<string, string> = { limit: '25', start }
    if (end) q.end = end
    if (next) q.nextToken = next
    const page = await whoopGet<Page<T>>(token, path, q)
    if (!page) break
    out.push(...page.records)
    if (!page.next_token) break
    next = page.next_token
  }
  return out
}

// deno-lint-ignore no-explicit-any
type Any = any

/** Holt Zyklen, Recovery, Schlaf, Workouts und Körperdaten und speichert sie */
export async function syncUser(db: SupabaseClient, conn: Connection, opts: { full?: boolean } = {}): Promise<Record<string, number>> {
  const token = await validToken(db, conn)
  const since = !opts.full && conn.last_sync_at ? new Date(Date.parse(conn.last_sync_at) - OVERLAP_DAYS * 86_400_000) : new Date(Date.now() - INITIAL_DAYS * 86_400_000)
  const start = since.toISOString()
  const uid = conn.user_id

  const [cycles, recoveries, sleeps, workouts] = await Promise.all([
    fetchAll<Any>(token, '/v2/cycle', start),
    fetchAll<Any>(token, '/v2/recovery', start),
    fetchAll<Any>(token, '/v2/activity/sleep', start),
    fetchAll<Any>(token, '/v2/activity/workout', start),
  ])
  const body = await whoopGet<Any>(token, '/v2/user/measurement/body')

  const up = async (table: string, rows: Record<string, unknown>[], onConflict: string) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict })
      if (error) throw error
    }
  }
  await up('whoop_cycles', cycles.map((c) => ({ user_id: uid, id: c.id, start_at: c.start, end_at: c.end ?? null, raw: c })), 'user_id,id')
  await up('whoop_recoveries', recoveries.map((r) => ({ user_id: uid, cycle_id: r.cycle_id, sleep_id: r.sleep_id ?? null, raw: r })), 'user_id,cycle_id')
  await up('whoop_sleeps', sleeps.map((s) => ({ user_id: uid, id: String(s.id), start_at: s.start, end_at: s.end, nap: !!s.nap, raw: s })), 'user_id,id')
  await up('whoop_workouts', workouts.map((w) => ({ user_id: uid, id: String(w.id), start_at: w.start, end_at: w.end, raw: w })), 'user_id,id')
  if (body) await up('whoop_body', [{ user_id: uid, raw: body, updated_at: new Date().toISOString() }], 'user_id')

  await db.from('whoop_connections').update({ last_sync_at: new Date().toISOString() }).eq('user_id', uid)
  return { cycles: cycles.length, recoveries: recoveries.length, sleeps: sleeps.length, workouts: workouts.length }
}

export async function getConnection(db: SupabaseClient, userId: string): Promise<Connection | null> {
  const { data } = await db.from('whoop_connections').select('*').eq('user_id', userId).maybeSingle()
  return (data as Connection) ?? null
}

/** Webhook-Signatur: base64(HMAC-SHA256(timestamp + rawBody, client_secret)) */
export async function verifySignature(rawBody: string, timestamp: string | null, signature: string | null): Promise<boolean> {
  if (!timestamp || !signature) return false
  // Replay-Schutz: max. 5 Minuten alt
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('WHOOP_CLIENT_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + rawBody))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}
