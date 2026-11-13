import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, berlinParts, complianceScore, recommendSleep, type DayKind, type RecoveryDay } from '../../core'
import { useStore } from '../../data/store'
import { Card, Note, PageHeader, Section, Stat } from '../components/ui'
import { KIND_HEX, formatShortDE, num } from '../format'

const axis = { stroke: '#8b94a3', fontSize: 11 }
const tooltip = { contentStyle: { background: '#14171c', border: '1px solid #262b33', borderRadius: 12, fontSize: 12 }, labelStyle: { color: '#e6e9ee' } }
const RANGES = [14, 30, 90] as const
const LEGEND: DayKind[] = ['DAY_SHIFT', 'NIGHT_SHIFT', 'SLEEP_DAY', 'FREE']
const LEGEND_LABEL: Partial<Record<DayKind, string>> = { DAY_SHIFT: 'Tag', NIGHT_SHIFT: 'Nacht', SLEEP_DAY: 'Schlaftag', FREE: 'Frei' }

export default function RecoveryPage() {
  const { engine, today, whoopSource, state } = useStore()
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  const from = addDays(today, -range + 1)
  const byDate = new Map<string, RecoveryDay>(engine.history.map((h) => [h.date, h]))
  const data = useMemo(() => {
    const out = []
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const h = byDate.get(d)
      out.push({
        i: out.length,
        date: d,
        label: formatShortDE(d),
        kind: engine.days.get(d)?.kind ?? 'FREE',
        recovery: h?.recoveryScore,
        hrv: h?.hrv,
        rhr: h?.rhr,
        sleep: h?.sleepHours !== undefined ? Math.round(h.sleepHours * 10) / 10 : undefined,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, from, today])

  const compliance = useMemo(() => {
    const rows: { date: string; score: number; rec: string; act: string }[] = []
    for (let d = addDays(today, -14); d < today; d = addDays(d, 1)) {
      const day = engine.days.get(d)
      const next = engine.days.get(addDays(d, 1))
      const h = byDate.get(addDays(d, 1))
      if (!day || !h?.sleepStart || !h.sleepEnd) continue
      const rec = recommendSleep({ day, next, settings: state.settings, planDay: engine.plan.byDate[d], nextPlanDay: engine.plan.byDate[addDays(d, 1)] })
      if (!rec.night) continue
      const act = { start: berlinParts(h.sleepStart).time, end: berlinParts(h.sleepEnd).time }
      rows.push({ date: d, score: complianceScore(rec.night, act), rec: `${rec.night.start}–${rec.night.end}`, act: `${act.start}–${act.end}` })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, today])
  const avgCompliance = compliance.length ? Math.round(compliance.reduce((a, r) => a + r.score, 0) / compliance.length) : null

  const shifts = data.map((d) => (
    <ReferenceArea key={d.date} x1={d.i - 0.5} x2={d.i + 0.5} fill={KIND_HEX[d.kind]} fillOpacity={d.kind === 'NIGHT_SHIFT' || d.kind === 'SLEEP_DAY' ? 0.25 : 0.08} strokeOpacity={0} ifOverflow="hidden" />
  ))
  const chart = (key: 'recovery' | 'hrv' | 'rhr' | 'sleep', color: string, unit: string, domain?: [number, number]) => (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        {shifts}
        <CartesianGrid stroke="#262b33" vertical={false} />
        <XAxis dataKey="i" type="number" domain={[-0.5, data.length - 0.5]} tick={axis} ticks={data.filter((_, k) => k % Math.ceil(range / 5) === 0).map((x) => x.i)} tickFormatter={(i: number) => data[i]?.label ?? ''} />
        <YAxis tick={axis} domain={domain ?? ['auto', 'auto']} />
        <Tooltip {...tooltip} labelFormatter={(i) => data[Number(i)]?.label ?? ''} formatter={(v) => `${v} ${unit}`} />
        <Line dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
  const p = engine.patterns

  return (
    <div className="space-y-5">
      <PageHeader
        title="Erholung"
        subtitle={whoopSource === 'demo' ? 'Beispieldaten (Demo-Modus)' : whoopSource === 'whoop' ? 'WHOOP' : 'Manuelle Eingaben'}
        right={
          <div className="flex rounded-xl bg-card2 p-0.5 text-xs">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-2.5 py-1.5 ${range === r ? 'bg-accent text-black' : ''}`}>
                {r} T
              </button>
            ))}
          </div>
        }
      />
      <div className="flex flex-wrap gap-3 px-1 text-xs text-muted">
        {LEGEND.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_HEX[k], opacity: 0.7 }} />
            {LEGEND_LABEL[k]}
          </span>
        ))}
      </div>
      {engine.history.length === 0 && <Note>Noch keine Erholungsdaten. Verbinde WHOOP in den Einstellungen oder trage täglich kurz Schlaf und Gefühl ein.</Note>}
      <Section title="Recovery (%)">
        <Card className="!px-1">{chart('recovery', '#34d399', '%', [0, 100])}</Card>
      </Section>
      <Section title="HRV (ms)">
        <Card className="!px-1">{chart('hrv', '#7dd3fc', 'ms')}</Card>
      </Section>
      <Section title="Ruhepuls (bpm)">
        <Card className="!px-1">{chart('rhr', '#fb7185', 'bpm')}</Card>
      </Section>
      <Section title="Schlaf (h)">
        <Card className="!px-1">{chart('sleep', '#a78bfa', 'h', [0, 11])}</Card>
      </Section>

      <Section title="Umsetzung der Schlafempfehlungen (14 Tage)">
        <Card className="space-y-2">
          {avgCompliance === null ? (
            <div className="text-sm text-muted">Braucht WHOOP-Schlafdaten.</div>
          ) : (
            <>
              <Stat label="Durchschnitt" value={`${avgCompliance} / 100`} sub="100 = Schlafenszeit und Aufstehen genau wie empfohlen" />
              <div className="space-y-1 text-sm">
                {compliance.slice(-7).map((r) => (
                  <div key={r.date} className="flex justify-between gap-2">
                    <span className="text-muted">{formatShortDE(r.date)}</span>
                    <span className="text-xs text-muted">Empf. {r.rec}</span>
                    <span className="text-xs">Ist {r.act}</span>
                    <span className={r.score >= 80 ? 'text-ok' : r.score >= 60 ? 'text-warn' : 'text-bad'}>{r.score}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="Auswertungen">
        <Card className="space-y-3">
          {!p.ready ? (
            <div className="text-sm text-muted">Auswertungen erscheinen nach ca. 6 Wochen Daten (aktuell {p.days} von 42 Tagen).</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Ø Recovery" value={p.meanRecovery !== null ? `${p.meanRecovery} %` : '–'} />
                <Stat label="Ø HRV" value={p.meanHrv !== null ? `${p.meanHrv} ms` : '–'} />
              </div>
              {Object.values(p.effects).map((e) => (
                <div key={e.label} className="flex items-center justify-between border-t border-line pt-2 text-sm">
                  <span>{e.label}</span>
                  <span className="text-muted">
                    {e.recoveryDelta !== null ? `${e.recoveryDelta > 0 ? '+' : ''}${e.recoveryDelta} Recovery` : 'zu wenig Daten'}
                    {e.hrvDeltaPct !== null ? ` · ${e.hrvDeltaPct > 0 ? '+' : ''}${e.hrvDeltaPct} % HRV` : ''} (n={e.n})
                  </span>
                </div>
              ))}
              {p.learnedNightShiftDrop !== undefined && (
                <Note>Gelerntes Muster: Nach Nachtschichten fällt deine Recovery im Schnitt um {num(p.learnedNightShiftDrop, 0)} Punkte. Die Vorausschau plant das vor Schlüsseleinheiten ein.</Note>
              )}
            </>
          )}
        </Card>
      </Section>
    </div>
  )
}
