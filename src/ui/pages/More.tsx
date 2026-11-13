import { Link } from 'react-router-dom'
import { useStore } from '../../data/store'
import { Card, PageHeader } from '../components/ui'

const ITEMS = [
  { to: '/tracking', icon: '📒', title: 'Tracking', sub: 'Verlauf, Ist-Werte, Verpflegung, Anpassungsprotokoll' },
  { to: '/rennwoche', icon: '🏁', title: 'Rennwoche', sub: 'Schichtkonflikt, Checkliste, Schlafstrategie' },
  { to: '/einstellungen', icon: '⚙️', title: 'Einstellungen & Export', sub: 'Profil, Schichtmodell, Gewichtung, WHOOP, .ics, Backup' },
]

export default function More() {
  const { syncStatus } = useStore()
  return (
    <div className="space-y-4">
      <PageHeader title="Mehr" subtitle={`Speicherung: ${syncStatus}`} />
      {ITEMS.map((i) => (
        <Link key={i.to} to={i.to} className="block">
          <Card className="flex items-center gap-3">
            <span className="text-2xl">{i.icon}</span>
            <div>
              <div className="font-semibold">{i.title}</div>
              <div className="text-sm text-muted">{i.sub}</div>
            </div>
            <span className="ml-auto text-muted">›</span>
          </Card>
        </Link>
      ))}
    </div>
  )
}
