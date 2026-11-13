// WHOOP-Webhooks (v2): recovery.updated, sleep.updated, workout.updated (+ *.deleted).
// Signatur prüfen, Nutzer über whoop_user_id finden, inkrementell abrufen – der Plan passt sich
// damit direkt nach dem Aufwachen an (auch nach dem Tagschlaf nach der Nachtschicht).
import { adminClient } from '../_shared/supabase.ts'
import { syncUser, verifySignature, type Connection } from '../_shared/whoop.ts'

interface WebhookBody {
  user_id: number
  id: string | number
  type: string
  trace_id?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const raw = await req.text()
  const ok = await verifySignature(raw, req.headers.get('X-WHOOP-Signature-Timestamp'), req.headers.get('X-WHOOP-Signature'))
  if (!ok) return new Response('invalid signature', { status: 401 })
  let body: WebhookBody
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const db = adminClient()
  const { data: conn } = await db.from('whoop_connections').select('*').eq('whoop_user_id', body.user_id).maybeSingle()
  if (!conn) return new Response('unknown user', { status: 200 })
  try {
    const uid = (conn as Connection).user_id
    if (body.type === 'workout.deleted') await db.from('whoop_workouts').delete().eq('user_id', uid).eq('id', String(body.id))
    else if (body.type === 'sleep.deleted') await db.from('whoop_sleeps').delete().eq('user_id', uid).eq('id', String(body.id))
    else if (body.type === 'recovery.deleted') await db.from('whoop_recoveries').delete().eq('user_id', uid).eq('sleep_id', String(body.id))
    else await syncUser(db, conn as Connection)
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('Webhook-Verarbeitung fehlgeschlagen', body.type, body.trace_id, e)
    // 500 → WHOOP versucht es erneut
    return new Response('error', { status: 500 })
  }
})
