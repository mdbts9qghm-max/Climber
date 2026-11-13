/** Web Push (iPhone: nur in der installierten PWA ab iOS 16.4). */
import { upcomingReminders, type Engine, type ISODate } from '../core'
import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupport(): { ok: boolean; reason?: string } {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return { ok: false, reason: 'Dieser Browser unterstützt kein Web Push. Auf dem iPhone: App über „Teilen → Zum Home-Bildschirm“ installieren und von dort öffnen (iOS 16.4+).' }
  if (!VAPID) return { ok: false, reason: 'VITE_VAPID_PUBLIC_KEY fehlt (siehe docs/AUTOMATIK.md).' }
  if (!supabase) return { ok: false, reason: 'Erinnerungen brauchen Supabase und eine Anmeldung.' }
  return { ok: true }
}

export async function enablePush(): Promise<string | null> {
  const sup = pushSupport()
  if (!sup.ok) return sup.reason!
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Benachrichtigungen wurden nicht erlaubt.'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) }))
  const { data } = await supabase!.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return 'Bitte zuerst anmelden.'
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase!.from('push_subscriptions').upsert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'user_id,endpoint' })
  return error ? error.message : null
}

/** Erinnerungen der nächsten 3 Tage serverseitig hinterlegen (ersetzt noch nicht verschickte) */
export async function syncReminders(e: Engine, today: ISODate, opts: { bedtime: boolean; nap: boolean }): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return
  await supabase.from('reminders').delete().eq('user_id', uid).is('sent_at', null)
  if (!opts.bedtime && !opts.nap) return
  const rows = upcomingReminders(e, today, 3, opts).map((r) => ({ user_id: uid, id: r.id, fire_at: r.fireAt, title: r.title, body: r.body }))
  if (rows.length) await supabase.from('reminders').upsert(rows, { onConflict: 'user_id,id' })
}
