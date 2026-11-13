// Verschickt fällige Erinnerungen (Schlafenszeit, Nap) per Web Push. Aufruf alle 5 min per pg_cron.
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { env } from '../_shared/whoop.ts'

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'forbidden' }, 403)
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  const db = adminClient()
  const now = new Date()
  const { data: due, error } = await db
    .from('reminders')
    .select('*')
    .is('sent_at', null)
    .lte('fire_at', now.toISOString())
    .gte('fire_at', new Date(now.getTime() - 30 * 60_000).toISOString()) // nichts Veraltetes nachschicken
  if (error) return json({ error: error.message }, 500)
  let sent = 0
  for (const r of due ?? []) {
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', r.user_id)
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: r.title, body: r.body, tag: r.id, url: '/' }))
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        // Abo abgelaufen → löschen
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('user_id', r.user_id).eq('endpoint', s.endpoint)
        else console.error('Push fehlgeschlagen', e)
      }
    }
    await db.from('reminders').update({ sent_at: now.toISOString() }).eq('user_id', r.user_id).eq('id', r.id)
  }
  // Alte Einträge aufräumen
  await db.from('reminders').delete().lt('fire_at', new Date(now.getTime() - 7 * 86_400_000).toISOString())
  return json({ ok: true, due: due?.length ?? 0, sent })
})
