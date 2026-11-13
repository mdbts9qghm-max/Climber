import { useState } from 'react'
import { COLOR_LABEL, type Assessment, type ISODate } from '../../core'
import { useStore } from '../../data/store'
import { COLOR_CLASS, num } from '../format'
import { Button, Card, Field, NumberInput, Scale, Stat } from './ui'

export function ManualRecoveryForm({ date, onDone }: { date: ISODate; onDone?: () => void }) {
  const { state, dispatch } = useStore()
  const existing = state.manual.find((m) => m.date === date)
  const [sleep, setSleep] = useState<number | undefined>(existing?.sleepHours ?? 7)
  const [quality, setQuality] = useState<number | undefined>(existing?.sleepQuality ?? 3)
  const [feeling, setFeeling] = useState<number | undefined>(existing?.feeling ?? 3)
  return (
    <div className="space-y-3">
      <Field label="Schlafdauer (h)">
        <NumberInput value={sleep} onChange={setSleep} step={0.25} min={0} max={14} />
      </Field>
      <Field label="Schlafqualität">
        <Scale value={quality} onChange={setQuality} labels={['schlecht', 'sehr gut']} />
      </Field>
      <Field label="Gefühl">
        <Scale value={feeling} onChange={setFeeling} labels={['platt', 'top']} />
      </Field>
      <Button
        className="w-full"
        disabled={sleep === undefined || !quality || !feeling}
        onClick={() => {
          dispatch({ type: 'manual', entry: { date, sleepHours: sleep!, sleepQuality: quality as 1, feeling: feeling as 1 } })
          onDone?.()
        }}
      >
        Speichern
      </Button>
    </div>
  )
}

export function RecoveryCard({ a, date, source }: { a: Assessment; date: ISODate; source: 'whoop' | 'demo' | null }) {
  const [edit, setEdit] = useState(false)
  if (!a.hasData || edit) {
    return (
      <Card className="space-y-3">
        <div>
          <div className="font-semibold">{a.hasData ? 'Erholung manuell korrigieren' : 'Keine WHOOP-Daten für heute'}</div>
          <div className="text-sm text-muted">Kurz eintragen – daraus berechnet die App deine Ampel.</div>
        </div>
        <ManualRecoveryForm date={date} onDone={() => setEdit(false)} />
      </Card>
    )
  }
  const color = a.color!
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-4">
        <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full ${COLOR_CLASS[color]}`}>
          <div className="text-xl font-bold leading-none">{a.score ?? '–'}</div>
          <div className="text-[10px] font-semibold">%</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">
            {a.source === 'manual' ? 'Readiness' : 'Recovery'} {COLOR_LABEL[color]}
          </div>
          <div className="text-xs text-muted">
            {a.source === 'manual' ? 'aus deiner Eingabe' : source === 'demo' ? 'Beispieldaten (Demo)' : 'WHOOP'} · Readiness {a.readiness ?? '–'} %
          </div>
        </div>
        {a.source === 'manual' && (
          <button className="text-sm text-accent" onClick={() => setEdit(true)}>
            ändern
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Schlaf" value={a.sleepHours !== null ? `${num(a.sleepHours)} h` : '–'} sub={a.sleepDebtH !== null ? `Defizit ${num(a.sleepDebtH)} h` : undefined} />
        <Stat label="HRV" value={a.hrv !== null ? `${Math.round(a.hrv)} ms` : '–'} sub={a.baselines.hrv30 ? `Ø30 ${Math.round(a.baselines.hrv30)} · Ø7 ${Math.round(a.baselines.hrv7 ?? a.baselines.hrv30)}` : undefined} />
        <Stat label="Ruhepuls" value={a.rhr !== null ? `${a.rhr} bpm` : '–'} sub={a.baselines.rhr30 ? `Ø30 ${Math.round(a.baselines.rhr30)}` : undefined} />
      </div>
      {a.triggers.length > 0 && <div className="text-xs text-muted">Auslöser: {a.triggers.join(' · ')}</div>}
      {a.source !== 'manual' && (
        <button className="text-xs text-muted underline" onClick={() => setEdit(true)}>
          Werte stimmen nicht? Manuell eintragen
        </button>
      )}
    </Card>
  )
}
