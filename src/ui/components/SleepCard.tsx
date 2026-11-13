import type { SleepPlan } from '../../core'
import { Card } from './ui'

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-6 text-center text-lg">{icon}</span>
      <span className="flex-1 text-sm text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function SleepCard({ plan, title = 'Schlaf' }: { plan: SleepPlan; title?: string }) {
  return (
    <Card className="space-y-2.5">
      <div className="font-semibold">{title}</div>
      {plan.daySleep && <Row icon="🛌" label="Tagschlaf nach der Nachtschicht" value={`${plan.daySleep.start}–${plan.daySleep.end}`} />}
      {plan.latestTrainingEnd && <Row icon="⏱️" label="Training spätestens bis" value={plan.latestTrainingEnd} />}
      {plan.nap && <Row icon="😴" label={plan.noNightReason?.startsWith('Rennen') ? 'Nap vor dem Start' : 'Nap vor der Nachtschicht'} value={`${plan.nap.start}–${plan.nap.end}`} />}
      {plan.departure && <Row icon="🚗" label="Abfahrt zur Arbeit" value={plan.departure} />}
      {plan.night && <Row icon="🌙" label="Heute ins Bett" value={plan.night.start} />}
      {plan.night && <Row icon="⏰" label="Aufstehen" value={plan.night.end} />}
      {plan.noNightReason && !plan.night && <div className="text-sm text-muted">Heute Nacht: {plan.noNightReason}</div>}
      {plan.notes.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-2 text-sm text-zinc-300">
          {plan.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}
      {plan.tip && <div className="rounded-lg bg-card2 px-3 py-2 text-xs text-muted">💡 {plan.tip}</div>}
    </Card>
  )
}
