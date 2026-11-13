import { useState } from 'react'
import { baseShift, cycleDay, type DayOverride, type ISODate, type OverrideType } from '../../core'
import { useStore } from '../../data/store'
import { dateLabel } from '../format'
import { Button, Field, Select, Sheet, TextInput } from './ui'

const TYPES: { value: OverrideType | 'NONE'; label: string }[] = [
  { value: 'NONE', label: 'Grundplan (keine Änderung)' },
  { value: 'V', label: 'V-Schicht (08:00–20:00)' },
  { value: 'URLAUB', label: 'Urlaub (freier Tag)' },
  { value: 'FREI', label: 'Frei (z. B. Tausch weg)' },
  { value: 'KRANK', label: 'Krank' },
  { value: 'TAUSCH', label: 'Tausch auf andere Schicht' },
  { value: 'UEBERSTUNDEN', label: 'Überstunden' },
  { value: 'FORTBILDUNG', label: 'Fortbildung/Sonderdienst' },
]
const BASE_LABEL = { T: 'Tagschicht', N: 'Nachtschicht', S: 'Schlaftag', F: 'Frei' }

export function OverrideSheet({ date, onClose }: { date: ISODate | null; onClose: () => void }) {
  return (
    <Sheet open={!!date} onClose={onClose} title={date ? dateLabel(date) : ''}>
      {date && <OverrideForm key={date} date={date} onClose={onClose} />}
    </Sheet>
  )
}

function OverrideForm({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const existing = state.overrides.find((o) => o.date === date)
  const [type, setType] = useState<OverrideType | 'NONE'>(existing?.type ?? 'NONE')
  const [shift, setShift] = useState<'T' | 'N' | 'V' | 'F'>(existing?.shift ?? 'T')
  const [start, setStart] = useState(existing?.start ?? '08:00')
  const [end, setEnd] = useState(existing?.end ?? (type === 'UEBERSTUNDEN' ? '21:00' : '16:00'))
  const [note, setNote] = useState(existing?.note ?? '')
  const base = baseShift(cycleDay(date, state.settings.shift.anchorDate))

  const save = () => {
    if (type === 'NONE') dispatch({ type: 'removeOverride', date })
    else {
      const o: DayOverride = { date, type, note: note || undefined }
      if (type === 'TAUSCH') o.shift = shift
      if (type === 'FORTBILDUNG') Object.assign(o, { start, end })
      if (type === 'UEBERSTUNDEN') Object.assign(o, { end, ...(base === 'S' || base === 'F' ? { start } : {}) })
      dispatch({ type: 'override', override: o })
    }
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        Grundrhythmus: Zyklustag {cycleDay(date, state.settings.shift.anchorDate)} · {BASE_LABEL[base]}
      </div>
      <Field label="Änderung">
        <Select value={type} onChange={setType} options={TYPES} />
      </Field>
      {type === 'TAUSCH' && (
        <Field label="Stattdessen">
          <Select
            value={shift}
            onChange={setShift}
            options={[
              { value: 'T', label: 'Tagschicht' },
              { value: 'N', label: 'Nachtschicht' },
              { value: 'V', label: 'V-Schicht' },
              { value: 'F', label: 'Frei' },
            ]}
          />
        </Field>
      )}
      {(type === 'FORTBILDUNG' || (type === 'UEBERSTUNDEN' && (base === 'S' || base === 'F'))) && (
        <Field label="Beginn">
          <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
      )}
      {(type === 'FORTBILDUNG' || type === 'UEBERSTUNDEN') && (
        <Field label={type === 'UEBERSTUNDEN' ? 'Neues Dienstende' : 'Ende'}>
          <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      )}
      {type !== 'NONE' && (
        <Field label="Notiz (optional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      <Button className="w-full" onClick={save}>
        Speichern – Plan wird sofort angepasst
      </Button>
    </div>
  )
}
