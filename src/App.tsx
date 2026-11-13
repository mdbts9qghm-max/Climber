import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { StoreProvider, useStore } from './data/store'
import { Disclaimer } from './ui/components/ui'
import Today from './ui/pages/Today'
import Cycle from './ui/pages/Cycle'
import PlanPage from './ui/pages/Plan'
import RecoveryPage from './ui/pages/Recovery'
import StrengthPage from './ui/pages/Strength'
import SessionDetail from './ui/pages/SessionDetail'
import Tracking from './ui/pages/Tracking'
import SettingsPage from './ui/pages/Settings'
import Onboarding from './ui/pages/Onboarding'
import RaceWeek from './ui/pages/RaceWeek'
import More from './ui/pages/More'

const NAV = [
  { to: '/', label: 'Heute', icon: '☀️' },
  { to: '/zyklus', label: 'Zyklus', icon: '🔁' },
  { to: '/plan', label: 'Plan', icon: '🗺️' },
  { to: '/erholung', label: 'Erholung', icon: '💚' },
  { to: '/kraft', label: 'Kraft', icon: '💪' },
  { to: '/mehr', label: 'Mehr', icon: '☰' },
]

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Shell() {
  const { state } = useStore()
  if (!state.onboarded && !location.pathname.startsWith('/whoop')) return <Onboarding />
  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <ScrollTop />
      <main className="px-4 pb-28">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/zyklus" element={<Cycle />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/erholung" element={<RecoveryPage />} />
          <Route path="/kraft" element={<StrengthPage />} />
          <Route path="/einheit/:id" element={<SessionDetail />} />
          <Route path="/tracking" element={<Tracking />} />
          <Route path="/rennwoche" element={<RaceWeek />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
          <Route path="/mehr" element={<More />} />
          <Route path="*" element={<Today />} />
        </Routes>
        <Disclaimer />
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-accent' : 'text-muted'}`}>
              <span className="text-lg leading-none">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </StoreProvider>
  )
}
