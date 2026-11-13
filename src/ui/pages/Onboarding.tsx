import { useState } from 'react'
import { vacationWarning } from '../../core'
import { useStore } from '../../data/store'
import { StrengthTestForm } from './Strength'
import { Button, Card, Disclaimer, Field, Note, NumberInput, TextInput, Toggle } from '../components/ui'
import { WhoopConnectButton } from '../components/WhoopConnect'

const STEPS = ['Willkommen', 'Profil', 'Schichtmodell', 'WHOOP', 'Krafttest', 'Rennwoche'] as const

export default function Onboarding() {
  const { state, dispatch, today } = useStore()
  const [step, setStep] = useState(0)
  const s = state.settings
  const upd = (fn: (x: typeof s) => void) => {
    const n = structuredClone(s)
    fn(n)
    dispatch({ type: 'settings', settings: n })
  }
  const next = () => setStep((x) => Math.min(STEPS.length - 1, x + 1))
  const finish = () => dispatch({ type: 'onboarded' })
  const warn = vacationWarning(s, state.overrides)

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pb-10">
      <div className="pt-safe flex gap-1 pt-6">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </div>
      <div className="text-xs uppercase tracking-wider text-muted">
        Schritt {step + 1}/{STEPS.length} · {STEPS[step]}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight">Ehrwald Trail 2027</h1>
          <p className="text-zinc-300">86 km · 4.295 hm · Start Fr 18.06.2027 um 23:00 · 22 h Zeitlimit.</p>
          <Card className="space-y-2 text-sm">
            <div className="font-semibold">Leitsatz</div>
            <p>Gesund und im Zeitlimit ins Ziel kommen und dabei in Calisthenics stärker werden. Konsistenz und Erholung gehen vor maximaler Belastung.</p>
          </Card>
          <Card className="space-y-1 text-sm text-zinc-300">
            <div>• Der Plan denkt in deinen 5-Tage-Schichtzyklen, nicht in Kalenderwochen.</div>
            <div>• Jede Einheit wird vor dem Training anhand deiner Erholung (WHOOP) bewertet und bei Bedarf angepasst.</div>
            <div>• Du bekommst jeden Tag eine Schlafempfehlung inklusive Nap vor der Nachtschicht.</div>
          </Card>
          <Note tone="warn">Der Plan ist eine automatische Empfehlung und ersetzt keine Beratung durch Trainer oder Arzt. Bei Schmerzen, Krankheit oder anhaltend schlechten Erholungswerten hat Pause Vorrang.</Note>
          <Button className="w-full" onClick={next}>
            Los geht's
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Dein Profil</h2>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aktueller Umfang (km/Woche)">
                <NumberInput value={s.profile.weeklyKmStart} onChange={(v) => v && upd((x) => (x.profile.weeklyKmStart = v))} />
              </Field>
              <Field label="Längster Lauf (km)">
                <NumberInput value={s.profile.longestRunKm} onChange={(v) => v && upd((x) => (x.profile.longestRunKm = v))} />
              </Field>
            </div>
            <Field label="Calisthenics-Niveau">
              <TextInput value={s.profile.calisthenicsLevel} onChange={(e) => upd((x) => (x.profile.calisthenicsLevel = e.target.value))} />
            </Field>
            <Field label="Ziele">
              <TextInput value={s.profile.goals.join(', ')} onChange={(e) => upd((x) => (x.profile.goals = e.target.value.split(',').map((g) => g.trim()).filter(Boolean)))} />
            </Field>
            <Toggle label="Fitnessstudio mit Laufband (Steigung)" checked={s.profile.gym} onChange={(v) => upd((x) => (x.profile.gym = v))} />
            <Toggle label="Calisthenics-Park" checked={s.profile.calisthenicsPark} onChange={(v) => upd((x) => (x.profile.calisthenicsPark = v))} />
            <div className="text-xs text-muted">Wohnort eher flach – Höhenmeter kommen vom Laufband, Treppen und drei Bergwochenenden. Keine Verletzungen bekannt.</div>
          </Card>
          <Button className="w-full" onClick={next}>
            Weiter
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Schichtmodell</h2>
          <Card className="space-y-2 text-sm">
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1">
              <span className="text-muted">1</span>
              <span>Tagschicht</span>
              <span>07:00–19:00</span>
              <span className="text-muted">2</span>
              <span>Nachtschicht</span>
              <span>19:00–07:00</span>
              <span className="text-muted">3</span>
              <span>Schlaftag</span>
              <span>–</span>
              <span className="text-muted">4</span>
              <span>Frei</span>
              <span>–</span>
              <span className="text-muted">5</span>
              <span>Frei oder V-Schicht</span>
              <span>08:00–20:00</span>
            </div>
            <div className="text-xs text-muted">Arbeitsbeginn jeweils 15 min vorher. V-Schichten trägst du per Tipp in der Zyklus-Ansicht ein.</div>
          </Card>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ankerdatum (Tag 1)">
                <TextInput type="date" value={s.shift.anchorDate} onChange={(e) => e.target.value && upd((x) => (x.shift.anchorDate = e.target.value))} />
              </Field>
              <Field label="Planstart">
                <TextInput type="date" value={s.shift.planStart} onChange={(e) => e.target.value && upd((x) => (x.shift.planStart = e.target.value))} />
              </Field>
              <Field label="Arbeitsweg (min)">
                <NumberInput value={s.shift.commuteMin} onChange={(v) => v !== undefined && upd((x) => (x.shift.commuteMin = v))} />
              </Field>
              <Field label="Morgenroutine (min)">
                <NumberInput value={s.shift.morningRoutineMin} onChange={(v) => v !== undefined && upd((x) => (x.shift.morningRoutineMin = v))} />
              </Field>
            </div>
          </Card>
          <Button className="w-full" onClick={next}>
            Weiter
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">WHOOP verbinden</h2>
          <Card className="space-y-3 text-sm">
            <p>Mit WHOOP passt sich jede Einheit automatisch an Recovery, HRV, Ruhepuls und Schlaf an – auch nach dem Tagschlaf nach der Nachtschicht.</p>
            <WhoopConnectButton />
            <p className="text-xs text-muted">Ohne WHOOP fragt die App kurz nach Schlafdauer, Schlafqualität und Gefühl.</p>
          </Card>
          <Toggle label="Bis dahin Demo-Daten anzeigen" checked={state.demoMode} onChange={(v) => dispatch({ type: 'demo', value: v })} />
          <Button className="w-full" onClick={next}>
            Weiter
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Erster Krafttest</h2>
          <p className="text-sm text-muted">Die Ergebnisse bestimmen deine Startstufen. Du kannst ihn auch am 14.11. (geplant) machen.</p>
          <Card>
            <StrengthTestForm date={today} onDone={next} />
          </Card>
          <Button variant="ghost" className="w-full" onClick={next}>
            Später machen
          </Button>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Rennwoche & Schichtplan</h2>
          {warn ? (
            <Note tone="bad">{warn}</Note>
          ) : (
            <Note tone="ok">Urlaub 18.–20.06.2027 ist eingetragen. Laut Rhythmus wäre Sa 19.06. (Zielschluss) eine Tagschicht – das ist damit gelöst.</Note>
          )}
          <Card className="space-y-1 text-sm">
            <div>Mo 14.06. Tagschicht · Di 15.06. Nachtschicht · Mi 16.06. Schlaftag</div>
            <div>Do 17.06. Frei (Anreise) · Fr 18.06. Rennen 23:00 · Sa 19.06. Zielschluss 21:00</div>
            <div className="text-xs text-muted">Die Nachtschicht am 15.06. kostet Erholung – der Taper berücksichtigt das.</div>
          </Card>
          <Button className="w-full" onClick={finish}>
            Plan starten
          </Button>
        </div>
      )}
      <Disclaimer />
    </div>
  )
}
