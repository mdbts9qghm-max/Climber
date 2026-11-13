import { Link } from 'react-router-dom'
import { MOUNTAIN_NOTICE_DAYS, PHASE_LABEL, RACE, addDays, dayView, diffDays, vacationWarning } from '../../core'
import { useStore } from '../../data/store'
import { RecoveryCard } from '../components/RecoveryCard'
import { SessionCard, SessionLine } from '../components/SessionCard'
import { SleepCard } from '../components/SleepCard'
import { Card, Chip, Note, PageHeader, Section } from '../components/ui'
import { KIND_CLASS, dateLabel } from '../format'

export default function Today() {
  const { engine, today, state, whoopSource } = useStore()
  const inPlan = !!engine.plan.byDate[today]
  const v = dayView(engine, today)
  const daysToRace = diffDays(today, RACE.date)
  const micro = engine.plan.micros.find((m) => m.start <= today && today <= m.end)
  const meso = engine.plan.mesos.find((m) => m.index === micro?.mesoIndex)
  const vacation = vacationWarning(state.settings, state.overrides)
  const mountain = engine.plan.days.find((d) => d.date > today && diffDays(today, d.date) <= MOUNTAIN_NOTICE_DAYS && d.sessions.some((s) => s.type === 'MOUNTAIN_DAY'))
  const tomorrow = engine.plan.byDate[addDays(today, 1)]
  const reduced = micro && micro.recoveryFactor < 1

  return (
    <div className="space-y-5">
      <PageHeader
        title="Heute"
        subtitle={dateLabel(today)}
        right={
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{Math.max(0, daysToRace)}</div>
            <div className="text-[11px] uppercase text-muted">Tage bis Ehrwald</div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <Chip className={KIND_CLASS[v.day.kind]}>
          Tag {v.day.cycleDay} · {v.day.label}
        </Chip>
        {v.day.window && (
          <Chip className="border-line text-zinc-300">
            Fenster {v.day.window.start}–{v.day.window.end}
          </Chip>
        )}
        {micro && (
          <Chip className="border-line text-muted">
            {PHASE_LABEL[micro.phase]}
            {meso && meso.index >= 0 ? ` · ${meso.label}/${micro.posInMeso + 1}` : ''}
            {micro.isDeload ? ' · Entlastung' : ''}
          </Chip>
        )}
      </div>

      {vacation && <Note tone="bad">{vacation}</Note>}
      {v.assessment.warning && <Note tone="bad">⚠️ {v.assessment.warning}</Note>}
      {mountain && (
        <Note tone="info">
          ⛰️ Bergwochenende in {diffDays(today, mountain.date)} Tagen ({dateLabel(mountain.date)} + Folgetag) – Anfahrt und Unterkunft planen.
        </Note>
      )}
      {reduced && <Note tone="warn">Mehrere schlechte Erholungstage: Der Umfang dieses Mikrozyklus ist automatisch um {Math.round((1 - micro!.recoveryFactor) * 100)} % reduziert.</Note>}
      {v.suggestion && <Note tone="ok">{v.suggestion.text}</Note>}

      {!inPlan && today < state.settings.shift.planStart && (
        <Note>Der Plan startet am {dateLabel(state.settings.shift.planStart)}. Bis dahin: locker laufen wie gewohnt.</Note>
      )}
      {!inPlan && today > state.settings.shift.raceDate && <Note tone="ok">Das Rennen ist vorbei – Glückwunsch! Gönn dir Erholung.</Note>}

      <Section title="Erholung">
        <RecoveryCard a={v.assessment} date={today} source={whoopSource} />
      </Section>

      <Section title="Training">
        {v.adjusted.length === 0 ? (
          <Card>
            <div className="font-semibold">Ruhetag</div>
            {(v.planDay?.notes ?? []).map((n, i) => (
              <div key={i} className="text-sm text-muted">
                {n}
              </div>
            ))}
          </Card>
        ) : (
          v.adjusted.map((a) => <SessionCard key={a.original.id} a={a} />)
        )}
        {v.planDay && v.adjusted.length > 0 && v.planDay.notes.map((n, i) => <Note key={i}>{n}</Note>)}
        {v.planDay && v.planDay.dropped.length > 0 && (
          <Card className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted">Gestrichen / verschoben</div>
            {v.planDay.dropped.map((d, i) => (
              <div key={i} className="text-sm">
                <span className="text-muted line-through">{d.session.title}</span> <span className="text-muted">– {d.reason}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Schlafempfehlung">
        <SleepCard plan={v.sleep} title="Heute & kommende Nacht" />
      </Section>

      {tomorrow && (
        <Section title={`Morgen · Tag ${tomorrow.day.cycleDay} ${tomorrow.day.label}`} action={<Link to="/zyklus" className="text-xs text-accent">Zyklus →</Link>}>
          <Card>
            {tomorrow.sessions.length ? tomorrow.sessions.map((s) => <SessionLine key={s.id} s={s} />) : <div className="text-sm text-muted">Ruhetag</div>}
          </Card>
        </Section>
      )}

    </div>
  )
}
