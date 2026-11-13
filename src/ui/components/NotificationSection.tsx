import { useState } from 'react'
import { enablePush, pushSupport, syncReminders } from '../../data/push'
import { useStore } from '../../data/store'
import { Card, Note, Section, Toggle } from './ui'

export function NotificationSection() {
  const { state, dispatch, engine, today } = useStore()
  const [msg, setMsg] = useState<string | null>(null)
  const n = state.settings.notifications
  const sup = pushSupport()
  const set = async (k: 'bedtime' | 'nap', v: boolean) => {
    if (v) {
      const err = await enablePush()
      if (err) {
        setMsg(err)
        return
      }
      setMsg('Erinnerungen aktiv.')
    }
    const next = { ...n, [k]: v }
    dispatch({ type: 'settings', settings: { ...state.settings, notifications: next } })
    if (!v) await syncReminders(engine, today, next)
  }
  return (
    <Section title="Erinnerungen (Web Push)">
      <Card className="space-y-2">
        {!sup.ok && <Note tone="warn">{sup.reason}</Note>}
        {msg && <Note>{msg}</Note>}
        <Toggle label="30 min vor der empfohlenen Schlafenszeit" checked={n.bedtime} onChange={(v) => set('bedtime', v)} />
        <Toggle label="10 min vor dem Nap (Tag 2)" checked={n.nap} onChange={(v) => set('nap', v)} />
        <div className="text-xs text-muted">Die Zeiten passen sich automatisch an Plan, Schichten und Erholung an (die nächsten 3 Tage werden hinterlegt).</div>
      </Card>
    </Section>
  )
}
