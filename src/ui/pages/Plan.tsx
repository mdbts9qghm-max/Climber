import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PHASE_LABEL, diffDays, isoWeek, microTotals, weeklyTotals, type Phase } from '../../core'
import { useStore } from '../../data/store'
import { Card, PageHeader, Section } from '../components/ui'
import { PHASE_HEX, formatShortDE, hm, km } from '../format'

const axis = { stroke: '#8b94a3', fontSize: 11 }
const tooltip = { contentStyle: { background: '#14171c', border: '1px solid #262b33', borderRadius: 12, fontSize: 12 }, labelStyle: { color: '#e6e9ee' } }

export default function PlanPage() {
  const { engine, state, today } = useStore()
  const plan = engine.plan
  const weeks = weeklyTotals(plan, state.logs)
  const thisWeek = (() => {
    const w = isoWeek(today)
    return `${w.year}-W${String(w.week).padStart(2, '0')}`
  })()
  const total = diffDays(plan.days[0].date, plan.days[plan.days.length - 1].date) + 1
  const phases: { phase: Phase; start: string; end: string }[] = []
  for (const m of plan.micros) {
    const last = phases[phases.length - 1]
    if (last && last.phase === m.phase) last.end = m.end
    else phases.push({ phase: m.phase, start: m.start, end: m.end })
  }
  const microData = plan.micros.map((m) => {
    const t = microTotals(plan, m.index)
    const done = state.logs.filter((l) => l.status !== 'skipped' && l.date >= m.start && l.date <= m.end)
    const strengthDone = done.filter((l) => l.sets?.length).length
    return { name: formatShortDE(m.start), kraft: t.strength, kraftIst: strengthDone, deload: m.isDeload, km: t.km }
  })
  const todayPos = Math.min(100, Math.max(0, (diffDays(plan.days[0].date, today) / total) * 100))

  return (
    <div className="space-y-5">
      <PageHeader title="Gesamtplan" subtitle={`${plan.micros.length} Mikrozyklen · ${plan.mesos.filter((m) => m.label.startsWith('M')).length} Mesozyklen`} />

      <Section title="Phasen">
        <Card className="space-y-3">
          <div className="relative flex h-6 overflow-hidden rounded-full">
            {phases.map((p) => (
              <div key={p.start} style={{ width: `${((diffDays(p.start, p.end) + 1) / total) * 100}%`, background: PHASE_HEX[p.phase] }} title={PHASE_LABEL[p.phase]} />
            ))}
            <div className="absolute top-0 h-full w-0.5 bg-white" style={{ left: `${todayPos}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            {phases.map((p) => (
              <div key={p.start} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PHASE_HEX[p.phase] }} />
                <span className="truncate">{PHASE_LABEL[p.phase]}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {formatShortDE(p.start)}–{formatShortDE(p.end)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Laufkilometer pro Kalenderwoche (Soll/Ist)">
        <Card className="!px-1">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={weeks} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke="#262b33" vertical={false} />
              <XAxis dataKey="label" tick={axis} interval={3} />
              <YAxis tick={axis} />
              <Tooltip {...tooltip} formatter={(v) => `${v} km`} />
              <Bar dataKey="plannedKm" name="Soll" fill="#7dd3fc55" radius={[3, 3, 0, 0]} />
              <Line dataKey="actualKm" name="Ist" stroke="#34d399" strokeWidth={2} dot={false} />
              <ReferenceLine x={weeks.find((w) => w.key === thisWeek)?.label} stroke="#fff" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </Section>

      <Section title="Höhenmeter pro Kalenderwoche (Soll/Ist)">
        <Card className="!px-1">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={weeks} margin={{ left: -10, right: 8, top: 8 }}>
              <CartesianGrid stroke="#262b33" vertical={false} />
              <XAxis dataKey="label" tick={axis} interval={3} />
              <YAxis tick={axis} />
              <Tooltip {...tooltip} formatter={(v) => `${v} hm`} />
              <Bar dataKey="plannedHm" name="Soll" fill="#f472b655" radius={[3, 3, 0, 0]} />
              <Line dataKey="actualHm" name="Ist" stroke="#f472b6" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </Section>

      <Section title="Krafteinheiten pro Mikrozyklus (Entlastung hell)">
        <Card className="!px-1">
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={microData} margin={{ left: -22, right: 8, top: 8 }}>
              <CartesianGrid stroke="#262b33" vertical={false} />
              <XAxis dataKey="name" tick={axis} interval={6} />
              <YAxis tick={axis} allowDecimals={false} />
              <Tooltip {...tooltip} />
              <Bar dataKey="kraft" name="Soll" fill="#a78bfa" radius={[3, 3, 0, 0]} shape={(p: unknown) => <DeloadBar {...(p as BarShapeProps)} />} />
              <Line dataKey="kraftIst" name="Ist" stroke="#34d399" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </Section>

      <Section title="Mesozyklen">
        <div className="space-y-2">
          {plan.mesos.map((meso) => {
            const micros = plan.micros.filter((m) => m.mesoIndex === meso.index)
            const sum = micros.reduce((a, m) => a + microTotals(plan, m.index).km, 0)
            const sumHm = micros.reduce((a, m) => a + microTotals(plan, m.index).hm, 0)
            const isNow = meso.start <= today && today <= meso.end
            return (
              <Card key={meso.index} className={isNow ? 'ring-1 ring-accent' : ''}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: PHASE_HEX[meso.phase] }} />
                  <span className="font-semibold">{meso.label}</span>
                  <span className="text-sm text-muted">{PHASE_LABEL[meso.phase]}</span>
                  <span className="ml-auto text-xs text-muted">
                    {formatShortDE(meso.start)}–{formatShortDE(meso.end)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {micros.map((m) => {
                    const t = microTotals(plan, m.index)
                    return (
                      <div
                        key={m.index}
                        title={`${formatShortDE(m.start)}: ${km(t.km)} ${hm(t.hm)}`}
                        className={`flex min-w-[42px] flex-1 flex-col items-center rounded-lg px-1 py-1 text-[11px] ${m.isDeload ? 'bg-sky-500/10 text-sky-300' : m.phase === 'taper' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-card2'} ${m.start <= today && today <= m.end ? 'ring-1 ring-accent' : ''}`}
                      >
                        <span className="font-semibold">{Math.round(t.km)}</span>
                        <span className="text-muted">{m.isMountain ? '⛰️' : m.hasNightRun ? '🌙' : m.isDeload ? 'E' : m.hasStrengthTest ? '📏' : 'km'}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 text-xs text-muted">
                  {km(Math.round(sum))} · {hm(sumHm) || '0 hm'}
                </div>
              </Card>
            )
          })}
        </div>
        <div className="px-1 text-xs text-muted">E = Entlastung · 📏 Krafttest · 🌙 Nachtlauf · ⛰️ Bergwochenende</div>
      </Section>
    </div>
  )
}

interface BarShapeProps {
  x: number
  y: number
  width: number
  height: number
  payload: { deload: boolean }
}
function DeloadBar({ x, y, width, height, payload }: BarShapeProps) {
  return <rect x={x} y={y} width={width} height={height} rx={3} fill={payload.deload ? '#7dd3fc' : '#a78bfa'} />
}
