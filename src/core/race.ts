/** Rennwoche, Konflikt mit dem Schichtplan, Checkliste (SPEC 7). */
import { RACE } from './config'
import { addDays, formatDE, weekdayShort } from './dates'
import { resolveDays } from './shifts'
import type { DayOverride, ISODate, Settings } from './types'

export interface RaceWeekDay {
  date: ISODate
  label: string
  shift: string
  conflict: boolean
  note?: string
}

/** Tage 14.–20.06.: Schicht laut Plan + Overrides, Konflikte markiert */
export function raceWeek(s: Settings, overrides: DayOverride[]): RaceWeekDay[] {
  const start = addDays(s.shift.raceDate, -4)
  const end = addDays(s.shift.raceDate, 2)
  const cutoffDate = addDays(s.shift.raceDate, 1)
  return resolveDays(start, end, overrides, s).map((d) => {
    const working = !!d.work
    let conflict = false
    let note: string | undefined
    if (d.date === s.shift.raceDate) {
      conflict = working
      note = `Rennstart ${RACE.start}`
    } else if (d.date === cutoffDate) {
      conflict = working
      note = `Zielschluss ${RACE.cutoff}`
    } else if (d.date === addDays(s.shift.raceDate, 2)) {
      conflict = working
      note = 'Erholung nach dem Rennen'
    } else if (d.kind === 'NIGHT_SHIFT') note = 'Nachtschicht im Taper kostet Erholung'
    return { date: d.date, label: `${weekdayShort(d.date)}, ${formatDE(d.date)}`, shift: d.label, conflict, note }
  })
}

/** Warnung, solange Renntag/Zielschluss/Folgetag nicht frei sind */
export function vacationWarning(s: Settings, overrides: DayOverride[]): string | null {
  const conflicts = raceWeek(s, overrides).filter((d) => d.conflict)
  if (!conflicts.length) return null
  return `Urlaub beantragen! Konflikt mit dem Schichtplan: ${conflicts.map((c) => `${c.label} (${c.shift})`).join(', ')}. Mindestens 18.–20.06., besser ab 14.06. für einen ausgeruhten Taper und die Anreise.`
}

export const RACE_CHECKLIST: { group: string; items: string[] }[] = [
  { group: 'Anreise', items: ['Anreise nach Ehrwald planen (Ankunft spätestens Do/Fr Vormittag)', 'Unterkunft gebucht', 'Startunterlagen abholen (Zeiten prüfen)', 'Dropbag packen'] },
  {
    group: 'Pflichtausrüstung',
    items: ['Laufrucksack/Weste', 'Wasserdichte Jacke mit Kapuze', 'Lange Laufhose/Beinlinge', 'Warme Schicht + Mütze + Handschuhe', 'Rettungsdecke', 'Pfeife', 'Erste-Hilfe-Set/Tape', 'Handy (geladen) + Notfallnummer', 'Becher', 'Mind. 1 l Wasserkapazität', 'Notfallverpflegung', 'Ausweis/Startnummer'],
  },
  { group: 'Licht', items: ['Stirnlampe (getestet)', 'Ersatzakku/Ersatzlampe', 'Rücklicht (falls Pflicht)'] },
  { group: 'Verpflegung', items: ['Verpflegungsplan: 60–90 g KH/h', 'Gels/Riegel für die ersten 4–5 h', 'Elektrolyte', 'Plan für die Verpflegungsstationen'] },
  {
    group: 'Schlaf & Start 23:00',
    items: ['Nächte davor: viel Schlaf (Schlafplan der App)', 'Freitag ausschlafen', 'Nap am Nachmittag (ca. 14:00–16:30)', 'Letzte große Mahlzeit ca. 20:00', 'Koffein-Strategie für die Nacht'],
  },
  { group: 'Sonstiges', items: ['Stöcke', 'Wettervorhersage prüfen', 'Anti-Scheuer-Creme', 'Wechselsocken im Dropbag'] },
]
