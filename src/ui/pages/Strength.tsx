import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PROGRESSIONS, PROGRESSION_IDS, nextGoal, stageOf, type StrengthTest } from '../../core'
import { useStore } from '../../data/store'
import { Button, Card, Field, NumberInput, PageHeader, Section, Select, Sheet } from '../components/ui'
import { formatDE, formatShortDE } from '../format'

const axis = { stroke: '#8b94a3', fontSize: 11 }

export function StrengthTestForm({ onDone, date }: { onDone: () => void; date: string }) {
  const { dispatch, state } = useStore()
  const [t, setT] = useState<StrengthTest>({
    date,
    pullUps: 0,
    dips: 0,
    pushUps: 0,
    hollowHoldSec: 0,
    frontLeverStage: state.strength.stages.frontLever,
    frontLeverHoldSec: 0,
    backLeverStage: state.strength.stages.backLever,
    backLeverHoldSec: 0,
  })
  const set = <K extends keyof StrengthTest>(k: K, v: StrengthTest[K]) => setT({ ...t, [k]: v })
  const n = (v: number | undefined) => Math.max(0, Math.round(v ?? 0))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max. saubere Klimmzüge">
          <NumberInput value={t.pullUps} onChange={(v) => set('pullUps', n(v))} />
        </Field>
        <Field label="Max. saubere Dips">
          <NumberInput value={t.dips} onChange={(v) => set('dips', n(v))} />
        </Field>
        <Field label="Max. Liegestütze">
          <NumberInput value={t.pushUps} onChange={(v) => set('pushUps', n(v))} />
        </Field>
        <Field label="Hollow Body Hold (s)">
          <NumberInput value={t.hollowHoldSec} onChange={(v) => set('hollowHoldSec', n(v))} />
        </Field>
      </div>
      <Field label="Front Lever: beste Stufe">
        <Select value={String(t.frontLeverStage)} onChange={(v) => set('frontLeverStage', Number(v))} options={PROGRESSIONS.frontLever.stages.map((s, i) => ({ value: String(i), label: s.name }))} />
      </Field>
      <Field label="Front Lever Haltezeit (s)">
        <NumberInput value={t.frontLeverHoldSec} onChange={(v) => set('frontLeverHoldSec', n(v))} />
      </Field>
      <Field label="Back Lever: beste Stufe">
        <Select value={String(t.backLeverStage)} onChange={(v) => set('backLeverStage', Number(v))} options={PROGRESSIONS.backLever.stages.map((s, i) => ({ value: String(i), label: s.name }))} />
      </Field>
      <Field label="Back Lever Haltezeit (s)">
        <NumberInput value={t.backLeverHoldSec} onChange={(v) => set('backLeverHoldSec', n(v))} />
      </Field>
      <Button
        className="w-full"
        onClick={() => {
          dispatch({ type: 'test', test: t })
          onDone()
        }}
      >
        Test speichern
      </Button>
    </div>
  )
}

export default function StrengthPage() {
  const { state, today } = useStore()
  const [open, setOpen] = useState(false)
  const tests = [...state.strengthTests].sort((a, b) => (a.date < b.date ? -1 : 1))
  const data = tests.map((t) => ({ label: formatShortDE(t.date), Klimmzüge: t.pullUps, Dips: t.dips, Hollow: t.hollowHoldSec }))
  return (
    <div className="space-y-5">
      <PageHeader title="Kraft" subtitle="Aufstieg erst, wenn die Kriterien erfüllt sind" right={<Button onClick={() => setOpen(true)}>Krafttest</Button>} />
      <Section title="Progressionen">
        <div className="space-y-2">
          {PROGRESSION_IDS.map((id) => {
            const p = PROGRESSIONS[id]
            const idx = state.strength.stages[id]
            const st = stageOf(state.strength, id)
            return (
              <Card key={id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-xs text-muted">Ziel: {p.goal}</div>
                </div>
                <div className="flex gap-1">
                  {p.stages.map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-accent' : i === idx ? 'bg-accent/60' : 'bg-line'}`} />
                  ))}
                </div>
                <div className="text-sm">
                  Stufe {idx + 1}/{p.stages.length}: <span className="font-semibold">{st.name}</span>
                </div>
                <div className="text-xs text-muted">Nächstes Ziel: {nextGoal(state.strength, id)}</div>
                {state.strength.streak[id] > 0 && <div className="text-xs text-ok">Kriterium {state.strength.streak[id]}× in Folge erfüllt</div>}
              </Card>
            )
          })}
        </div>
      </Section>
      <Section title="Testergebnisse">
        <Card className="!px-1">
          {data.length === 0 ? (
            <div className="px-3 text-sm text-muted">Noch kein Krafttest. Der erste ist im Onboarding bzw. am 14.11.2026 geplant.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="#262b33" vertical={false} />
                <XAxis dataKey="label" tick={axis} />
                <YAxis tick={axis} />
                <Tooltip contentStyle={{ background: '#14171c', border: '1px solid #262b33', borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="Klimmzüge" stroke="#7dd3fc" strokeWidth={2} />
                <Line dataKey="Dips" stroke="#f472b6" strokeWidth={2} />
                <Line dataKey="Hollow" stroke="#a78bfa" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        {tests.length > 0 && (
          <Card className="space-y-1 text-sm">
            {[...tests].reverse().map((t) => (
              <div key={t.date} className="flex justify-between">
                <span className="text-muted">{formatDE(t.date)}</span>
                <span>
                  {t.pullUps} KZ · {t.dips} Dips · Hollow {t.hollowHoldSec} s · FL {PROGRESSIONS.frontLever.stages[t.frontLeverStage]?.name.replace(' Front Lever', '')} {t.frontLeverHoldSec} s
                </span>
              </div>
            ))}
          </Card>
        )}
      </Section>
      {state.strength.history.length > 0 && (
        <Section title="Aufstiege">
          <Card className="space-y-1 text-sm">
            {[...state.strength.history].reverse().slice(0, 15).map((h, i) => (
              <div key={i}>
                <span className="text-muted">{h.date.length === 10 ? formatShortDE(h.date) : h.date}</span> {PROGRESSIONS[h.progression].label}: {PROGRESSIONS[h.progression].stages[h.to]?.name}
                <div className="text-xs text-muted">{h.reason}</div>
              </div>
            ))}
          </Card>
        </Section>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Krafttest eintragen">
        <StrengthTestForm date={today} onDone={() => setOpen(false)} />
      </Sheet>
    </div>
  )
}
