import { Link } from 'react-router-dom'
import { addDays, findSession } from '../../core'
import { useStore } from '../../data/store'
import { Card, PageHeader, Section, Stat } from '../components/ui'
import { dateLabel, formatDuration, km, num } from '../format'

export default function Tracking() {
  const { state, engine, today } = useStore()
  const logs = [...state.logs].sort((a, b) => (a.date < b.date ? 1 : -1))
  const last7 = logs.filter((l) => l.date > addDays(today, -7) && l.status !== 'skipped')
  const sum = (k: 'distanceKm' | 'elevationM' | 'durationMin') => last7.reduce((a, l) => a + (l[k] ?? 0), 0)
  const planned = engine.plan.days.filter((d) => d.date > addDays(today, -7) && d.date <= today).flatMap((d) => d.sessions)
  const done = planned.filter((s) => state.logs.some((l) => l.sessionId === s.id && l.status !== 'skipped')).length
  return (
    <div className="space-y-5">
      <PageHeader title="Tracking" subtitle="Erledigte Einheiten, Ist-Werte, Gefühl und Verpflegung" />
      <Section title="Letzte 7 Tage">
        <Card className="grid grid-cols-4 gap-2">
          <Stat label="Einheiten" value={`${done}/${planned.length}`} />
          <Stat label="km" value={num(sum('distanceKm'))} />
          <Stat label="hm" value={Math.round(sum('elevationM'))} />
          <Stat label="Zeit" value={formatDuration(sum('durationMin'))} />
        </Card>
      </Section>
      <Section title="Verlauf">
        {logs.length === 0 && <Card className="text-sm text-muted">Noch nichts eingetragen. Hake Einheiten in der Heute-Ansicht ab.</Card>}
        <div className="space-y-2">
          {logs.map((l) => {
            const s = findSession(engine.plan, l.sessionId)
            const dec = state.decisions.find((d) => d.sessionId === l.sessionId)
            return (
              <Link key={l.sessionId} to={`/einheit/${encodeURIComponent(l.sessionId)}`}>
                <Card className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s?.title ?? l.sessionId}</div>
                      <div className="text-xs text-muted">{dateLabel(l.date)}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <div className={l.status === 'done' ? 'text-ok' : l.status === 'partial' ? 'text-warn' : 'text-muted'}>{l.status === 'done' ? 'Erledigt' : l.status === 'partial' ? 'Teilweise' : 'Ausgelassen'}</div>
                      <div className="text-xs text-muted">
                        {l.distanceKm ? km(l.distanceKm) + ' · ' : ''}
                        {l.durationMin ? formatDuration(l.durationMin) : ''}
                        {l.feeling ? ` · Gefühl ${l.feeling}/5` : ''}
                      </div>
                    </div>
                  </div>
                  {l.fueling?.carbsPerHour && <div className="mt-1 text-xs text-muted">🍌 {l.fueling.carbsPerHour} g KH/h {l.fueling.notes ? `– ${l.fueling.notes}` : ''}</div>}
                  {dec && !dec.accepted && <div className="mt-1 text-xs text-warn">Anpassung abgelehnt, Original ausgeführt</div>}
                  {l.notes && <div className="mt-1 text-xs text-zinc-300">{l.notes}</div>}
                </Card>
              </Link>
            )
          })}
        </div>
      </Section>
      {state.decisions.length > 0 && (
        <Section title="Protokoll der Anpassungen">
          <Card className="space-y-2 text-sm">
            {[...state.decisions].reverse().map((d) => (
              <div key={d.sessionId}>
                <span className="text-muted">{dateLabel(d.date)}:</span> {d.accepted ? 'Anpassung angenommen' : 'abgelehnt'} – {d.original} → {d.adjusted}
                <div className="text-xs text-muted">{d.reason}</div>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  )
}
