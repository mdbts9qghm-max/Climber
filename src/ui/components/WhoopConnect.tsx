import { useState } from 'react'
import { connectWhoop } from '../../data/whoopClient'
import { supabase } from '../../data/supabase'
import { Button } from './ui'

export function WhoopConnectButton() {
  const [err, setErr] = useState<string | null>(null)
  if (!supabase)
    return <div className="rounded-xl bg-card2 p-3 text-xs text-muted">WHOOP braucht Supabase (siehe docs/SUPABASE.md und docs/WHOOP.md). Bis dahin: manuelle Eingabe oder Demo-Daten.</div>
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={async () => setErr(await connectWhoop())}>
        Mit WHOOP verbinden
      </Button>
      {err && <div className="text-xs text-bad">{err}</div>}
    </div>
  )
}
