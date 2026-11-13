import { Link } from 'react-router-dom'
import type { AdjustedSession, Session, SessionLog } from '../../core'
import { useStore } from '../../data/store'
import { km, hm, formatDuration, sessionIcon, sessionSummary } from '../format'
import { Button, Card, Chip } from './ui'

const STATUS: Record<SessionLog['status'], [string, string]> = {
  done: ['Erledigt', 'border-ok/40 bg-ok/15 text-ok'],
  partial: ['Teilweise', 'border-warn/40 bg-warn/15 text-warn'],
  skipped: ['Ausgelassen', 'border-line bg-card2 text-muted'],
}

function MiniDetails({ s, dim }: { s: Session; dim?: boolean }) {
  return (
    <div className={dim ? 'opacity-60' : ''}>
      <div className={`font-semibold ${dim ? 'line-through decoration-1' : ''}`}>{s.title}</div>
      <div className="text-xs text-muted">{sessionSummary(s)}</div>
      <div className="text-xs text-muted">{s.intensity.rpe}</div>
    </div>
  )
}

export function SessionCard({ a, compact = false }: { a: AdjustedSession; compact?: boolean }) {
  const { state, dispatch } = useStore()
  const s = a.original
  const log = state.logs.find((l) => l.sessionId === s.id)
  const decision = state.decisions.find((d) => d.sessionId === s.id)
  const declined = decision && !decision.accepted
  const shown = declined ? s : (a.adjusted ?? null)

  const decide = (accepted: boolean) =>
    dispatch({
      type: 'decision',
      decision: { sessionId: s.id, date: s.date, accepted, original: s.title, adjusted: a.adjusted?.title ?? 'Ruhetag', reason: a.reason, decidedAt: new Date().toISOString() },
    })
  const quick = (status: SessionLog['status']) => {
    const exec = shown ?? s
    dispatch({
      type: 'log',
      log: {
        sessionId: s.id,
        date: s.date,
        status,
        executed: a.changed ? (declined ? 'original' : 'adjusted') : undefined,
        durationMin: status === 'done' ? exec.durationMin : undefined,
        distanceKm: status === 'done' ? exec.distanceKm : undefined,
        elevationM: status === 'done' ? exec.elevationM : undefined,
      },
    })
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none">{sessionIcon(s)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {s.key && <Chip className="border-accent/40 bg-accent/10 text-accent">Schlüsseleinheit</Chip>}
            {s.optional && <Chip className="border-line text-muted">optional</Chip>}
            {s.movedFrom && <Chip className="border-violet-400/40 text-violet-300">verschoben</Chip>}
            {a.changed && !declined && <Chip className="border-warn/40 bg-warn/10 text-warn">angepasst · {a.factor} %</Chip>}
            {declined && <Chip className="border-line text-muted">Original gewählt</Chip>}
            {log && <Chip className={STATUS[log.status][1]}>{STATUS[log.status][0]}</Chip>}
            {s.startTime && <span className="text-xs text-muted">ab {s.startTime}</span>}
          </div>
          {a.changed && !declined ? (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Original</div>
                <MiniDetails s={s} dim />
              </div>
              <div>
                <div className="mb-0.5 text-[10px] uppercase tracking-wide text-warn">Anpassung</div>
                {a.adjusted ? <MiniDetails s={a.adjusted} /> : <div className="font-semibold">Ruhetag</div>}
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <div className="text-base font-semibold">{s.title}</div>
              <div className="text-sm text-muted">{sessionSummary(s)}</div>
            </div>
          )}
        </div>
      </div>
      {!compact && <p className="text-sm text-zinc-300">{s.goal}</p>}
      {(a.changed || a.reason) && <p className={`rounded-lg px-3 py-2 text-sm ${a.changed ? 'bg-warn/10 text-amber-100' : 'bg-card2 text-muted'}`}>{a.reason}</p>}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          {!log && shown && (
            <>
              <Button onClick={() => quick('done')} className="flex-1">
                Erledigt
              </Button>
              <Button variant="secondary" onClick={() => quick('skipped')} className="flex-1">
                Auslassen
              </Button>
            </>
          )}
          {log && (
            <Button variant="secondary" onClick={() => dispatch({ type: 'removeLog', sessionId: s.id })} className="flex-1">
              Rückgängig
            </Button>
          )}
          <Link to={`/einheit/${encodeURIComponent(s.id)}`} className="flex-1">
            <Button variant="secondary" className="w-full">
              Details
            </Button>
          </Link>
          {a.changed && !log && (
            <Button variant="ghost" onClick={() => decide(!!declined)} className="w-full">
              {declined ? 'Anpassung doch übernehmen' : 'Anpassung ablehnen – Original ausführen'}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

export function SessionLine({ s, status }: { s: Session; status?: SessionLog['status'] }) {
  return (
    <Link to={`/einheit/${encodeURIComponent(s.id)}`} className="flex items-center gap-2 rounded-lg px-1 py-1 active:bg-card2">
      <span className="text-base">{sessionIcon(s)}</span>
      <span className={`min-w-0 flex-1 truncate text-sm ${status === 'skipped' ? 'text-muted line-through' : ''}`}>
        {s.title}
        {s.optional && <span className="text-muted"> (optional)</span>}
      </span>
      <span className="shrink-0 text-xs text-muted">{s.category === 'run' && s.distanceKm ? `${km(s.distanceKm)}${s.elevationM ? ' · ' + hm(s.elevationM) : ''}` : formatDuration(s.durationMin)}</span>
      {status === 'done' && <span className="text-ok">✓</span>}
    </Link>
  )
}
