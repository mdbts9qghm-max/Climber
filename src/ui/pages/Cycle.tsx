import { useState } from 'react'
import { PHASE_LABEL, addDays, microTotals } from '../../core'
import { useStore } from '../../data/store'
import { OverrideSheet } from '../components/OverrideSheet'
import { SessionLine } from '../components/SessionCard'
import { Card, Chip, PageHeader, Section } from '../components/ui'
import { KIND_CLASS, dateLabel, hm, km } from '../format'

export default function Cycle() {
  const { engine, today, state } = useStore()
  const [edit, setEdit] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const plan = engine.plan
  const curIdx = Math.max(0, plan.micros.findIndex((m) => m.start <= today && today <= m.end))
  const idx = Math.min(plan.micros.length - 1, Math.max(0, (today < plan.micros[0].start ? 0 : curIdx) + offset))
  const shown = [plan.micros[idx], plan.micros[idx + 1]].filter(Boolean)
  const logBy = new Map(state.logs.map((l) => [l.sessionId, l.status]))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zyklus"
        subtitle="Tippe auf einen Tag, um V-Schicht, Urlaub & Co. einzutragen"
        right={
          <div className="flex gap-1">
            <button className="rounded-lg bg-card2 px-3 py-1.5" onClick={() => setOffset(offset - 1)} aria-label="Zurück">
              ‹
            </button>
            {offset !== 0 && (
              <button className="rounded-lg bg-card2 px-2 py-1.5 text-xs" onClick={() => setOffset(0)}>
                Heute
              </button>
            )}
            <button className="rounded-lg bg-card2 px-3 py-1.5" onClick={() => setOffset(offset + 1)} aria-label="Weiter">
              ›
            </button>
          </div>
        }
      />
      {shown.map((m) => {
        const t = microTotals(plan, m.index)
        const meso = plan.mesos.find((x) => x.index === m.mesoIndex)
        return (
          <Section
            key={m.index}
            title={`${m.index === curIdx ? 'Aktueller' : m.index === curIdx + 1 ? 'Nächster' : ''} Mikrozyklus · ${PHASE_LABEL[m.phase]}${meso && meso.index >= 0 && m.phase !== 'race' ? ` ${meso.label}/${m.posInMeso + 1}` : ''}`}
            action={<span className="text-xs text-muted">{km(t.km)} {t.hm ? '· ' + hm(t.hm) : ''}</span>}
          >
            {(m.isDeload || m.isMountain || m.recoveryFactor < 1) && (
              <div className="flex flex-wrap gap-2 px-1">
                {m.isDeload && <Chip className="border-sky-400/40 text-sky-300">Entlastung −35 %</Chip>}
                {m.isMountain && <Chip className="border-pink-400/40 text-pink-300">⛰️ Bergwochenende</Chip>}
                {m.recoveryFactor < 1 && <Chip className="border-warn/40 text-warn">Erholung: −{Math.round((1 - m.recoveryFactor) * 100)} %</Chip>}
              </div>
            )}
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => addDays(m.start, i))
                .filter((d) => d <= m.end && plan.byDate[d])
                .map((d) => {
                  const pd = plan.byDate[d]
                  return (
                    <Card key={d} className={`space-y-1.5 !p-3 ${d === today ? 'ring-1 ring-accent' : ''}`}>
                      <button className="flex w-full items-center gap-2 text-left" onClick={() => setEdit(d)}>
                        <span className="w-24 shrink-0 text-sm font-semibold">{dateLabel(d).slice(0, 10)}</span>
                        <Chip className={KIND_CLASS[pd.day.kind]}>
                          {pd.day.cycleDay} · {pd.day.label}
                        </Chip>
                        {pd.day.override && <span className="text-xs text-warn">geändert</span>}
                        <span className="ml-auto text-xs text-muted">{pd.day.window ? `${pd.day.window.start}–${pd.day.window.end}` : ''} ✎</span>
                      </button>
                      {pd.sessions.map((s) => (
                        <SessionLine key={s.id} s={s} status={logBy.get(s.id)} />
                      ))}
                      {pd.sessions.length === 0 && <div className="px-1 text-sm text-muted">{pd.notes[0] ?? 'Ruhetag'}</div>}
                      {pd.dropped.map((x, i) => (
                        <div key={i} className="px-1 text-xs text-muted">
                          <span className="line-through">{x.session.title}</span> – {x.reason}
                        </div>
                      ))}
                    </Card>
                  )
                })}
            </div>
          </Section>
        )
      })}
      <OverrideSheet date={edit} onClose={() => setEdit(null)} />
    </div>
  )
}
