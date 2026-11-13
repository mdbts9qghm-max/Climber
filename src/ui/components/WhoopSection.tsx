import { useEffect, useState } from 'react'
import { useStore } from '../../data/store'
import { disconnectWhoop, whoopStatus, type WhoopStatus } from '../../data/whoopClient'
import { WhoopConnectButton } from './WhoopConnect'
import { Button, Card, Note, Section } from './ui'

export function WhoopSection() {
  const { whoop, whoopSource, refreshWhoop, setWhoop } = useStore()
  const [st, setSt] = useState<WhoopStatus | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    whoopStatus().then(setSt)
    const p = new URLSearchParams(location.search)
    const w = p.get('whoop')
    if (w === 'ok') setMsg('WHOOP verbunden – die letzten 60 Tage wurden geladen.')
    else if (w) setMsg(`WHOOP-Verbindung: ${w}${p.get('detail') ? ` (${p.get('detail')})` : ''}`)
    if (w) refreshWhoop(false).catch(() => undefined)
  }, [refreshWhoop])

  return (
    <Section title="WHOOP">
      <Card className="space-y-3">
        {msg && <Note tone={msg.includes('verbunden –') ? 'ok' : 'warn'}>{msg}</Note>}
        <div className="text-sm">
          Status:{' '}
          {st?.connected ? (
            <span className="text-ok">verbunden</span>
          ) : (
            <span className="text-muted">{!st?.configured ? 'Supabase nicht konfiguriert' : !st.loggedIn ? 'erst anmelden' : 'nicht verbunden'}</span>
          )}
          {st?.lastSync && <span className="text-muted"> · letzter Abruf {new Date(st.lastSync).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>}
        </div>
        {whoopSource === 'whoop' && whoop && (
          <div className="text-xs text-muted">
            {whoop.cycles.length} Zyklen · {whoop.sleeps.length} Schlafphasen · {whoop.workouts.length} Workouts{whoop.maxHr ? ` · max. HF ${whoop.maxHr}` : ''}
          </div>
        )}
        {st?.connected ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setMsg(await refreshWhoop(true))
                setSt(await whoopStatus())
                setBusy(false)
              }}
            >
              {busy ? 'Lädt …' : 'Jetzt abrufen'}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm('WHOOP trennen und gespeicherte WHOOP-Daten löschen?')) return
                await disconnectWhoop()
                setWhoop(null)
                setSt(await whoopStatus())
              }}
            >
              Trennen
            </Button>
          </div>
        ) : (
          st?.loggedIn && <WhoopConnectButton />
        )}
        <div className="text-xs text-muted">Recovery, HRV, Ruhepuls, Schlaf, Strain und Workouts. Zuordnung zum Trainingstag über WHOOP-Zyklen – der Tagschlaf nach der Nachtschicht zählt zum Schlaftag. Workouts werden automatisch geplanten Einheiten zugeordnet (korrigierbar in den Einheit-Details).</div>
      </Card>
    </Section>
  )
}
