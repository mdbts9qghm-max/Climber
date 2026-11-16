import { useState } from 'react'
import { supabase } from '../../data/supabase'
import { uploadAll } from '../../data/sync'
import { useStore } from '../../data/store'
import { Button, Card, Note, Section } from './ui'

export function AccountSection() {
  const { state, syncStatus } = useStore()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <Section title="Synchronisation">
      <Card className="space-y-3">
        {!supabase ? (
          <div className="text-sm text-muted">Supabase ist noch nicht konfiguriert. Die App speichert alles lokal auf diesem Gerät.</div>
        ) : (
          <>
            <div className="text-sm">Status: {syncStatus}</div>
            <div className="text-xs text-muted">Kein Passwort nötig: Die App ist automatisch mit deiner Datenbank verbunden. Die Anmeldung hängt an diesem Gerät bzw. an der installierten App.</div>
            {msg && <Note>{msg}</Note>}
            <Button variant="secondary" className="w-full" onClick={async () => setMsg(await uploadAll(state))}>
              Alles jetzt hochladen
            </Button>
          </>
        )}
        <div className="text-xs text-muted">Tipp: Exportiere ab und zu ein Backup (unten). Damit kannst du nach einem Handywechsel oder gelöschten Website-Daten alles wiederherstellen.</div>
      </Card>
    </Section>
  )
}
