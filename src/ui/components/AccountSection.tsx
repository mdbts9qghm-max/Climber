import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../data/supabase'
import { uploadAll } from '../../data/sync'
import { useStore } from '../../data/store'
import { Button, Card, Field, Note, Section, TextInput } from './ui'

export function AccountSection() {
  const { state, syncStatus } = useStore()
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase) {
    return (
      <Section title="Konto & Synchronisation">
        <Card className="text-sm text-muted">Supabase ist noch nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Die App speichert alles lokal auf diesem Gerät.</Card>
      </Section>
    )
  }

  return (
    <Section title="Konto & Synchronisation">
      <Card className="space-y-3">
        <div className="text-sm text-muted">Status: {syncStatus}</div>
        {msg && <Note>{msg}</Note>}
        {session ? (
          <>
            <div className="text-sm">Angemeldet als {session.user.email}</div>
            <Button variant="secondary" className="w-full" onClick={async () => setMsg(await uploadAll(state))}>
              Lokale Daten jetzt hochladen (Umzug)
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await supabase!.auth.signOut()
                location.reload()
              }}
            >
              Abmelden
            </Button>
          </>
        ) : (
          <>
            <Field label="E-Mail" hint="Du bekommst einen Anmeldelink per Mail. Daten bleiben bis dahin lokal.">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@example.com" />
            </Field>
            <Button
              className="w-full"
              disabled={!email.includes('@')}
              onClick={async () => {
                const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/einstellungen', shouldCreateUser: true } })
                setSent(!error)
                setMsg(error ? `Fehler: ${error.message}` : 'Mail verschickt. In der installierten iPhone-App bitte den 6-stelligen Code eingeben (der Link öffnet Safari).')
              }}
            >
              Anmeldecode senden
            </Button>
            {sent && (
              <>
                <Field label="Code aus der Mail">
                  <TextInput inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="123456" />
                </Field>
                <Button
                  className="w-full"
                  disabled={code.length < 6}
                  onClick={async () => {
                    const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' })
                    if (error) setMsg(`Fehler: ${error.message}`)
                    else location.reload()
                  }}
                >
                  Anmelden
                </Button>
              </>
            )}
          </>
        )}
      </Card>
    </Section>
  )
}
