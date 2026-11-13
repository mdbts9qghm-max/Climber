import { RACE, RACE_CHECKLIST, diffDays, raceWeek, vacationWarning } from '../../core'
import { useStore } from '../../data/store'
import { Card, Note, PageHeader, Section } from '../components/ui'

export default function RaceWeek() {
  const { state, dispatch, today } = useStore()
  const week = raceWeek(state.settings, state.overrides)
  const warn = vacationWarning(state.settings, state.overrides)
  const total = RACE_CHECKLIST.reduce((a, g) => a + g.items.length, 0)
  const done = Object.values(state.checklist).filter(Boolean).length
  return (
    <div className="space-y-5">
      <PageHeader title="Rennwoche" subtitle={`${RACE.name} · noch ${Math.max(0, diffDays(today, RACE.date))} Tage`} />
      <Card className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xl font-bold">{RACE.distanceKm} km</div>
          <div className="text-xs text-muted">Distanz</div>
        </div>
        <div>
          <div className="text-xl font-bold">{RACE.elevationM.toLocaleString('de-DE')} hm</div>
          <div className="text-xs text-muted">bergauf</div>
        </div>
        <div>
          <div className="text-xl font-bold">22 h</div>
          <div className="text-xs text-muted">Zeitlimit</div>
        </div>
        <div className="col-span-3 text-sm text-muted">Start Fr 18.06.2027 23:00 in Ehrwald · Zielschluss Sa 21:00 · Ziel: ankommen im Zeitlimit</div>
      </Card>
      {warn ? <Note tone="bad">{warn}</Note> : <Note tone="ok">Urlaub 18.–20.06.2027 ist eingetragen – kein Konflikt mit dem Schichtplan am Renntag.</Note>}
      <Section title="Schichten rund ums Rennen">
        <Card className="space-y-1.5">
          {week.map((d) => (
            <div key={d.date} className="flex items-center justify-between text-sm">
              <span>{d.label}</span>
              <span className={d.conflict ? 'font-semibold text-bad' : 'text-muted'}>
                {d.shift}
                {d.note ? ` · ${d.note}` : ''}
              </span>
            </div>
          ))}
        </Card>
      </Section>
      <Section title={`Checkliste (${done}/${total})`}>
        <div className="space-y-2">
          {RACE_CHECKLIST.map((g) => (
            <Card key={g.group} className="space-y-1">
              <div className="mb-1 font-semibold">{g.group}</div>
              {g.items.map((it) => {
                const key = `${g.group}:${it}`
                const on = !!state.checklist[key]
                return (
                  <label key={key} className="flex items-start gap-3 py-1 text-sm">
                    <input type="checkbox" checked={on} onChange={(e) => dispatch({ type: 'checklist', key, value: e.target.checked })} className="mt-0.5 h-5 w-5 accent-sky-300" />
                    <span className={on ? 'text-muted line-through' : ''}>{it}</span>
                  </label>
                )
              })}
            </Card>
          ))}
        </div>
      </Section>
    </div>
  )
}
