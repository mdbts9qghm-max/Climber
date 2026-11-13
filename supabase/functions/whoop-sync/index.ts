// Abruf der WHOOP-Daten.
// - Nutzer (JWT): eigener Abruf, z. B. beim Öffnen der App. ?action=disconnect trennt die Verbindung.
// - Zeitplan (Header x-cron-secret = CRON_SECRET): täglicher Abruf für alle verbundenen Nutzer.
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { getConnection, syncUser, type Connection } from '../_shared/whoop.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const db = adminClient()
  const url = new URL(req.url)
  try {
    const cron = req.headers.get('x-cron-secret')
    if (cron && cron === Deno.env.get('CRON_SECRET')) {
      const { data } = await db.from('whoop_connections').select('*')
      const results: Record<string, unknown> = {}
      for (const c of (data ?? []) as Connection[]) {
        try {
          results[c.user_id] = await syncUser(db, c)
        } catch (e) {
          results[c.user_id] = { error: String(e) }
        }
      }
      return json({ ok: true, results })
    }

    const userId = await userFromRequest(req)
    if (!userId) return json({ error: 'Nicht angemeldet' }, 401)

    if (url.searchParams.get('action') === 'disconnect') {
      for (const t of ['whoop_connections', 'whoop_cycles', 'whoop_recoveries', 'whoop_sleeps', 'whoop_workouts', 'whoop_body']) {
        await db.from(t).delete().eq('user_id', userId)
      }
      return json({ ok: true, disconnected: true })
    }

    const conn = await getConnection(db, userId)
    if (!conn) return json({ ok: false, connected: false })
    // Fallback-Abruf beim Öffnen: höchstens alle 15 min, außer force=1
    const force = url.searchParams.get('force') === '1'
    if (!force && conn.last_sync_at && Date.now() - Date.parse(conn.last_sync_at) < 15 * 60_000) {
      return json({ ok: true, skipped: true, last_sync_at: conn.last_sync_at })
    }
    const counts = await syncUser(db, conn, { full: url.searchParams.get('full') === '1' })
    return json({ ok: true, counts })
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
