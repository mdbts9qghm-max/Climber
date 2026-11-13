import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { berlinParts, dayView, exerciseLine, hrZones, matchWorkouts, workoutActuals, type Session, type SessionLog, type SetResult } from '../../core'
import { useStore } from '../../data/store'
import { Button, Card, Chip, Field, NumberInput, PageHeader, Scale, Section, Select, TextInput } from '../components/ui'
import { dateLabel, formatDuration, hm, km, sessionIcon } from '../format'

function Details({ s }: { s: Session }) {
  const { whoop, state } = useStore()
  const maxHr = state.settings.profile.maxHr ?? whoop?.maxHr ?? null
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <span>⏱ {formatDuration(s.durationMin)}</span>
        {s.distanceKm ? <span>📏 {km(s.distanceKm)}</span> : null}
        {s.elevationM ? <span>⛰ {hm(s.elevationM)}</span> : null}
        {s.treadmill && (
          <span>
            Laufband {s.treadmill.inclinePct} % · {km(s.treadmill.km)}
          </span>
        )}
      </div>
      <div className="text-sm">
        <span className="text-muted">Intensität: </span>
        {s.intensity.rpe}
        {s.intensity.zone ? ` · ${s.intensity.zone}` : ''}
        {maxHr && s.intensity.zone && <ZoneHint zone={s.intensity.zone} maxHr={maxHr} />}
      </div>
      {s.fueling && <div className="text-sm">🍌 Verpflegung: {s.fueling} KH/h protokollieren</div>}
      {s.gearTest && <div className="text-sm">🎒 Ausrüstungstest: Rennschuhe, Weste, Stöcke, Stirnlampe</div>}
      {(['warmup', 'main', 'cooldown'] as const).map((k) =>
        s.structure[k].length && !(k === 'main' && s.exercises?.length) ? (
          <div key={k}>
            <div className="text-xs uppercase tracking-wide text-muted">{k === 'warmup' ? 'Aufwärmen' : k === 'main' ? 'Hauptteil' : 'Abwärmen'}</div>
            <ul className="mt-1 space-y-1 text-sm">
              {s.structure[k].map((x, i) => (
                <li key={i}>• {x}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {s.notes?.map((n, i) => (
        <div key={i} className="text-xs text-muted">
          {n}
        </div>
      ))}
    </Card>
  )
}

function ZoneHint({ zone, maxHr }: { zone: string; maxHr: number }) {
  const zs = hrZones(maxHr)
  const nums = (zone.match(/\d/g) ?? []).map(Number)
  if (!nums.length) return null
  const lo = zs.find((z) => z.zone === Math.min(...nums))
  const hi = zs.find((z) => z.zone === Math.max(...nums))
  if (!lo || !hi) return null
  return <span className="text-muted"> ({lo.from}–{hi.to} bpm)</span>
}

export default function SessionDetail() {
  const { id = '' } = useParams()
  const sid = decodeURIComponent(id)
  const nav = useNavigate()
  const { engine, state, dispatch, today, whoop } = useStore()
  const found = useMemo(() => {
    for (const pd of engine.plan.days) {
      const s = pd.sessions.find((x) => x.id === sid)
      if (s) return { s, pd, dropped: null as string | null }
      const d = pd.dropped.find((x) => x.session.id === sid)
      if (d) return { s: d.session, pd, dropped: d.reason }
    }
    return null
  }, [engine, sid])
  const log = state.logs.find((l) => l.sessionId === sid)
  const adjusted = found && found.pd.date === today ? dayView(engine, today).adjusted.find((a) => a.original.id === sid) : undefined
  const declined = state.decisions.find((d) => d.sessionId === sid && !d.accepted)
  const target = adjusted?.adjusted && adjusted.changed && !declined ? adjusted.adjusted : found?.s

  const [form, setForm] = useState<SessionLog>(
    () =>
      log ?? {
        sessionId: sid,
        date: found?.pd.date ?? today,
        status: 'done',
        durationMin: target?.durationMin,
        distanceKm: target?.distanceKm,
        elevationM: target?.elevationM,
        sets: target?.exercises?.filter((e) => e.progression && !e.attempt).map((e) => ({ exercise: e.name, progression: e.progression, reps: e.reps ? Array(e.sets).fill(undefined) : undefined, holdSec: e.holdSec ? Array(e.sets).fill(undefined) : undefined })),
      },
  )
  const set = <K extends keyof SessionLog>(k: K, v: SessionLog[K]) => setForm((f) => ({ ...f, [k]: v }))

  // WHOOP-Workouts dieses Tages zur Auswahl
  const dayWorkouts = (whoop?.workouts ?? []).filter((w) => found && berlinParts(w.start).date === found.pd.date)
  const auto = useMemo(() => (whoop ? matchWorkouts(engine.plan.days, whoop.workouts, state.workoutAssignments) : new Map<string, string>()), [whoop, engine, state.workoutAssignments])
  const assignedWorkout = [...auto.entries()].find(([, s]) => s === sid)?.[0]

  if (!found) {
    return (
      <div className="space-y-4">
        <PageHeader title="Einheit nicht gefunden" />
        <Link to="/" className="text-accent">
          ← Zurück
        </Link>
      </div>
    )
  }
  const s = found.s

  const applyWorkout = (wid: string) => {
    const w = whoop!.workouts.find((x) => x.id === wid)
    if (!w) return
    const a = workoutActuals(w)
    setForm((f) => ({ ...f, whoopWorkoutId: wid, durationMin: a.durationMin, distanceKm: a.distanceKm ?? f.distanceKm, elevationM: a.elevationM ?? f.elevationM, avgHr: a.avgHr, strain: a.strain }))
    dispatch({ type: 'assignWorkout', workoutId: wid, sessionId: sid })
  }

  const save = () => {
    dispatch({ type: 'log', log: { ...form, sets: form.sets?.map(cleanSet), executed: adjusted?.changed ? (declined ? 'original' : 'adjusted') : undefined } })
    nav(-1)
  }

  return (
    <div className="space-y-5">
      <PageHeader title={`${sessionIcon(s)} ${s.title}`} subtitle={dateLabel(found.pd.date)} right={<button onClick={() => nav(-1)} className="text-sm text-accent">Zurück</button>} />
      <div className="flex flex-wrap gap-2 px-1">
        {s.key && <Chip className="border-accent/40 bg-accent/10 text-accent">Schlüsseleinheit</Chip>}
        <Chip className="border-line text-muted">Empfindlichkeit: {s.sensitivity === 'high' ? 'hoch' : s.sensitivity === 'medium' ? 'mittel' : 'niedrig'}</Chip>
        {s.movedFrom && <Chip className="border-violet-400/40 text-violet-300">verschoben vom {dateLabel(s.movedFrom)}</Chip>}
      </div>
      {found.dropped && <Card className="text-sm text-warn">Gestrichen: {found.dropped}</Card>}
      <p className="px-1 text-zinc-300">{s.goal}</p>
      {adjusted?.changed && (
        <Card className="space-y-2 border-warn/40">
          <div className="text-xs uppercase tracking-wide text-warn">Heutige Anpassung ({adjusted.factor} %)</div>
          <div className="text-sm">{adjusted.reason}</div>
          {adjusted.adjusted && <Details s={adjusted.adjusted} />}
          {declined && <div className="text-xs text-muted">Du hast die Anpassung abgelehnt – Originalplan unten.</div>}
        </Card>
      )}
      <Section title={adjusted?.changed ? 'Originalplan' : 'Ablauf'}>
        <Details s={s} />
      </Section>
      {s.exercises && s.exercises.length > 0 && (
        <Section title="Übungen">
          <Card className="space-y-1.5 text-sm">
            {s.exercises.map((e, i) => (
              <div key={i} className={e.attempt ? 'text-warn' : ''}>
                {exerciseLine(e)}
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Tracking">
        <Card className="space-y-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(v) => set('status', v)}
              options={[
                { value: 'done', label: 'Erledigt' },
                { value: 'partial', label: 'Teilweise' },
                { value: 'skipped', label: 'Ausgelassen' },
              ]}
            />
          </Field>
          {whoop && (
            <Field label="WHOOP-Workout" hint={assignedWorkout ? 'Automatisch zugeordnet – du kannst korrigieren.' : undefined}>
              <Select
                value={form.whoopWorkoutId ?? assignedWorkout ?? ''}
                onChange={(v) => (v ? applyWorkout(v) : (set('whoopWorkoutId', undefined), assignedWorkout && dispatch({ type: 'assignWorkout', workoutId: assignedWorkout, sessionId: null })))}
                options={[{ value: '', label: dayWorkouts.length ? 'keins' : 'kein Workout an diesem Tag' }, ...dayWorkouts.map((w) => ({ value: w.id, label: `${berlinParts(w.start).time} ${w.sport_name ?? 'Workout'} · ${workoutActuals(w).durationMin} min` }))]}
              />
            </Field>
          )}
          {form.status !== 'skipped' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Dauer (min)">
                  <NumberInput value={form.durationMin} onChange={(v) => set('durationMin', v)} />
                </Field>
                {s.category === 'run' || s.category === 'race' ? (
                  <>
                    <Field label="km">
                      <NumberInput value={form.distanceKm} onChange={(v) => set('distanceKm', v)} step={0.1} />
                    </Field>
                    <Field label="hm">
                      <NumberInput value={form.elevationM} onChange={(v) => set('elevationM', v)} />
                    </Field>
                  </>
                ) : (
                  <Field label="Ø Puls">
                    <NumberInput value={form.avgHr} onChange={(v) => set('avgHr', v)} />
                  </Field>
                )}
              </div>
              {form.sets && form.sets.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm text-muted">Sätze (Wiederholungen bzw. Sekunden) – steuern die Progression</div>
                  {form.sets.map((r, i) => (
                    <SetRow key={i} r={r} onChange={(nr) => set('sets', form.sets!.map((x, j) => (j === i ? nr : x)))} />
                  ))}
                </div>
              )}
              <Field label="Gefühl">
                <Scale value={form.feeling} onChange={(v) => set('feeling', v)} labels={['sehr schwer', 'sehr leicht']} />
              </Field>
              {(s.fueling || s.type === 'LONG_RUN' || s.type === 'B2B_RUN' || s.type === 'NIGHT_RUN' || s.type === 'MOUNTAIN_DAY') && (
                <div className="space-y-2 rounded-xl bg-card2 p-3">
                  <div className="text-sm font-semibold">Verpflegung & Ausrüstung</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="KH pro Stunde (g)">
                      <NumberInput value={form.fueling?.carbsPerHour} onChange={(v) => set('fueling', { ...form.fueling, carbsPerHour: v })} />
                    </Field>
                    <Field label="Getrunken (ml)">
                      <NumberInput value={form.fueling?.drinkMl} onChange={(v) => set('fueling', { ...form.fueling, drinkMl: v })} />
                    </Field>
                  </div>
                  <Field label="Verträglichkeit / Notizen">
                    <TextInput value={form.fueling?.notes ?? ''} onChange={(e) => set('fueling', { ...form.fueling, notes: e.target.value })} />
                  </Field>
                  <Field label="Ausrüstung (Schuhe, Weste, Lampe …)">
                    <TextInput value={form.gearNotes ?? ''} onChange={(e) => set('gearNotes', e.target.value)} />
                  </Field>
                </div>
              )}
            </>
          )}
          <Field label="Notizen">
            <TextInput value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button onClick={save} className="flex-1">
              Speichern
            </Button>
            {log && (
              <Button
                variant="danger"
                onClick={() => {
                  dispatch({ type: 'removeLog', sessionId: sid })
                  nav(-1)
                }}
              >
                Löschen
              </Button>
            )}
          </div>
        </Card>
      </Section>
    </div>
  )
}

function cleanSet(r: SetResult): SetResult {
  return { ...r, reps: r.reps?.filter((x): x is number => typeof x === 'number'), holdSec: r.holdSec?.filter((x): x is number => typeof x === 'number') }
}

function SetRow({ r, onChange }: { r: SetResult; onChange: (r: SetResult) => void }) {
  const key = r.reps ? 'reps' : 'holdSec'
  const vals = (r[key] ?? []) as (number | undefined)[]
  return (
    <div>
      <div className="mb-1 text-sm">{r.exercise}</div>
      <div className="flex gap-2">
        {vals.map((v, i) => (
          <div key={i} className="flex-1">
            <NumberInput value={v} placeholder={`${i + 1}. ${key === 'reps' ? 'Wdh' : 's'}`} onChange={(nv) => onChange({ ...r, [key]: vals.map((x, j) => (j === i ? nv : x)) as number[] })} />
          </div>
        ))}
      </div>
    </div>
  )
}
