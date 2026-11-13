import { useRef, useState } from 'react'
import { RECOVERY_WEIGHTS, exportIcs, icsToOverrides, parseIcs, type RecoveryWeights, type Settings } from '../../core'
import { clearLocal } from '../../data/localRepo'
import { normalizeState } from '../../data/state'
import { useStore } from '../../data/store'
import { AccountSection } from '../components/AccountSection'
import { NotificationSection } from '../components/NotificationSection'
import { WhoopSection } from '../components/WhoopSection'
import { Button, Card, Field, Note, NumberInput, PageHeader, Section, TextInput, Toggle } from '../components/ui'

const WEIGHT_LABEL: Record<keyof RecoveryWeights, string> = {
  recovery: 'WHOOP Recovery',
  hrv: 'HRV vs. Mittel',
  rhr: 'Ruhepuls vs. Mittel',
  sleep: 'Schlaf (Dauer, Performance, Defizit)',
  load: 'Strain Vortag',
  shift: 'Schichtkontext',
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function SettingsPage() {
  const { state, dispatch, engine } = useStore()
  const s = state.settings
  const [msg, setMsg] = useState<string | null>(null)
  const [withShifts, setWithShifts] = useState(true)
  const backupRef = useRef<HTMLInputElement>(null)
  const icsRef = useRef<HTMLInputElement>(null)
  const upd = (patch: (x: Settings) => Settings) => dispatch({ type: 'settings', settings: patch(structuredClone(s)) })

  return (
    <div className="space-y-5">
      <PageHeader title="Einstellungen" />
      {msg && <Note tone="ok">{msg}</Note>}

      <Section title="Profil">
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aktueller Umfang (km/Woche)" hint="Startwert des Plans">
              <NumberInput value={s.profile.weeklyKmStart} onChange={(v) => v && upd((x) => ((x.profile.weeklyKmStart = v), x))} />
            </Field>
            <Field label="Längster Lauf bisher (km)">
              <NumberInput value={s.profile.longestRunKm} onChange={(v) => v && upd((x) => ((x.profile.longestRunKm = v), x))} />
            </Field>
            <Field label="Pace locker (min/km)">
              <NumberInput value={s.profile.easyPace} step={0.1} onChange={(v) => v && upd((x) => ((x.profile.easyPace = v), x))} />
            </Field>
            <Field label="Pace lang (min/km)">
              <NumberInput value={s.profile.longPace} step={0.1} onChange={(v) => v && upd((x) => ((x.profile.longPace = v), x))} />
            </Field>
            <Field label="Max. Herzfrequenz" hint="leer = aus WHOOP">
              <NumberInput value={s.profile.maxHr ?? undefined} onChange={(v) => upd((x) => ((x.profile.maxHr = v ?? null), x))} />
            </Field>
          </div>
          <Field label="Calisthenics-Niveau">
            <TextInput value={s.profile.calisthenicsLevel} onChange={(e) => upd((x) => ((x.profile.calisthenicsLevel = e.target.value), x))} />
          </Field>
          <Field label="Calisthenics-Ziele (Komma-getrennt)">
            <TextInput value={s.profile.goals.join(', ')} onChange={(e) => upd((x) => ((x.profile.goals = e.target.value.split(',').map((g) => g.trim()).filter(Boolean)), x))} />
          </Field>
          <Toggle label="Fitnessstudio mit Laufband (Steigung)" checked={s.profile.gym} onChange={(v) => upd((x) => ((x.profile.gym = v), x))} />
          <Toggle label="Calisthenics-Park" checked={s.profile.calisthenicsPark} onChange={(v) => upd((x) => ((x.profile.calisthenicsPark = v), x))} />
        </Card>
      </Section>

      <Section title="Schichtmodell">
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ankerdatum (Zyklustag 1)">
              <TextInput type="date" value={s.shift.anchorDate} onChange={(e) => e.target.value && upd((x) => ((x.shift.anchorDate = e.target.value), x))} />
            </Field>
            <Field label="Planstart">
              <TextInput type="date" value={s.shift.planStart} onChange={(e) => e.target.value && upd((x) => ((x.shift.planStart = e.target.value), x))} />
            </Field>
            <Field label="Arbeitsweg (min)">
              <NumberInput value={s.shift.commuteMin} onChange={(v) => v !== undefined && upd((x) => ((x.shift.commuteMin = v), x))} />
            </Field>
            <Field label="Puffer (min)">
              <NumberInput value={s.shift.bufferMin} onChange={(v) => v !== undefined && upd((x) => ((x.shift.bufferMin = v), x))} />
            </Field>
            <Field label="Morgenroutine (min)">
              <NumberInput value={s.shift.morningRoutineMin} onChange={(v) => v !== undefined && upd((x) => ((x.shift.morningRoutineMin = v), x))} />
            </Field>
            <Field label="Nap-Beginn (Tag 2)">
              <TextInput type="time" value={s.shift.napStart} onChange={(e) => upd((x) => ((x.shift.napStart = e.target.value), x))} />
            </Field>
            <Field label="Schlaf nach Nacht ab">
              <TextInput type="time" value={s.shift.postNightSleepStart} onChange={(e) => upd((x) => ((x.shift.postNightSleepStart = e.target.value), x))} />
            </Field>
            <Field label="… bis">
              <TextInput type="time" value={s.shift.postNightSleepEnd} onChange={(e) => upd((x) => ((x.shift.postNightSleepEnd = e.target.value), x))} />
            </Field>
          </div>
          <div className="text-xs text-muted">Rhythmus: T 07:00–19:00 · N 19:00–07:00 · Schlaftag · Frei · Frei/V 08:00–20:00. Arbeitsbeginn jeweils 15 min früher.</div>
          <Button variant="secondary" className="w-full" onClick={() => icsRef.current?.click()}>
            Dienstplan (.ics) importieren
          </Button>
          <input
            ref={icsRef}
            type="file"
            accept=".ics,text/calendar"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const ov = icsToOverrides(parseIcs(await f.text()), s)
              dispatch({ type: 'overrides', overrides: ov })
              setMsg(`${ov.length} Abweichungen vom Grundrhythmus übernommen.`)
              e.target.value = ''
            }}
          />
        </Card>
      </Section>

      <Section title="Gewichtung der Erholungsfaktoren" action={<button className="text-xs text-accent" onClick={() => upd((x) => ((x.weights = { ...RECOVERY_WEIGHTS }), x))}>Zurücksetzen</button>}>
        <Card className="space-y-3">
          {(Object.keys(WEIGHT_LABEL) as (keyof RecoveryWeights)[]).map((k) => (
            <label key={k} className="block">
              <div className="flex justify-between text-sm">
                <span>{WEIGHT_LABEL[k]}</span>
                <span className="tabular-nums text-muted">{Math.round(s.weights[k] * 100)} %</span>
              </div>
              <input type="range" min={0} max={0.6} step={0.01} value={s.weights[k]} onChange={(e) => upd((x) => ((x.weights[k] = Number(e.target.value)), x))} className="w-full accent-sky-300" />
            </label>
          ))}
          <div className="text-xs text-muted">Die Gewichte werden automatisch normiert. Sie bestimmen die Readiness und damit, wie stark harte Einheiten bei Gelb gekürzt werden.</div>
        </Card>
      </Section>

      <WhoopSection />
      <AccountSection />
      <NotificationSection />

      <Section title="Export & Backup">
        <Card className="space-y-3">
          <Toggle label="Schichten in den Kalender aufnehmen" checked={withShifts} onChange={setWithShifts} />
          <Button className="w-full" onClick={() => download('ehrwald-trail-plan.ics', exportIcs(engine.plan, { includeShifts: withShifts, stamp: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z' }), 'text/calendar')}>
            Plan als .ics-Kalender
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => download(`ehrwald-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json')}>
            Backup exportieren (JSON)
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => backupRef.current?.click()}>
            Backup importieren
          </Button>
          <input
            ref={backupRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const next = normalizeState(JSON.parse(await f.text()))
                dispatch({ type: 'replace', state: { ...next, updatedAt: new Date().toISOString() } })
                setMsg('Backup importiert.')
              } catch {
                setMsg('Backup konnte nicht gelesen werden.')
              }
              e.target.value = ''
            }}
          />
        </Card>
      </Section>

      <Section title="Daten">
        <Card className="space-y-3">
          <Toggle label="Demo-Modus (Beispieldaten statt WHOOP)" checked={state.demoMode} onChange={(v) => dispatch({ type: 'demo', value: v })} />
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (confirm('Alle lokalen Daten löschen? (Backup vorher exportieren)')) {
                clearLocal()
                location.href = '/'
              }
            }}
          >
            Lokale Daten löschen
          </Button>
        </Card>
      </Section>
    </div>
  )
}
