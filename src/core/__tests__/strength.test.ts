import { describe, expect, it } from 'vitest'
import { applySessionResults, applyStrengthTest, initialStrengthState, meetsCriteria, PROGRESSIONS, stageOf } from '../strength'
import { caliMain } from '../sessions'
import type { StrengthState } from '../types'
import { ctx } from './helpers'

describe('Kraftprogression', () => {
  it('steigt nur, wenn die Kriterien erfüllt sind (2 Einheiten in Folge)', () => {
    let s = initialStrengthState()
    s = { ...s, stages: { ...s.stages, pull: 1 } } // Australian Rows 3 × 12
    const fail = [{ exercise: 'Australian Rows', progression: 'pull' as const, reps: [12, 12, 9] }]
    const ok = [{ exercise: 'Australian Rows', progression: 'pull' as const, reps: [12, 12, 13] }]
    s = applySessionResults(s, '2026-11-17', fail)
    expect(s.stages.pull).toBe(1)
    s = applySessionResults(s, '2026-11-20', ok)
    expect(s.stages.pull).toBe(1) // erst eine Einheit erfüllt
    s = applySessionResults(s, '2026-11-22', fail)
    expect(s.streak.pull).toBe(0)
    s = applySessionResults(s, '2026-11-25', ok)
    s = applySessionResults(s, '2026-11-27', ok)
    expect(s.stages.pull).toBe(2)
    expect(s.history.at(-1)!.reason).toMatch(/Kriterium erfüllt/)
  })
  it('Haltezeiten: Front Lever steigt nur bei 3 × 15 s im Tuck', () => {
    let s: StrengthState = { ...initialStrengthState(), stages: { pull: 0, push: 0, frontLever: 1, backLever: 0, core: 0 } }
    const r = (h: number[]) => [{ exercise: 'Tuck', progression: 'frontLever' as const, holdSec: h }]
    expect(meetsCriteria(PROGRESSIONS.frontLever.stages[1], r([15, 15, 14])[0])).toBe(false)
    s = applySessionResults(s, 'a', r([15, 16, 15]))
    s = applySessionResults(s, 'b', r([15, 15, 15]))
    expect(s.stages.frontLever).toBe(2)
  })
  it('Muscle-Up-Training erst ab 10 Klimmzügen und 10 Dips (Krafttest)', () => {
    let s: StrengthState = { ...initialStrengthState(), stages: { pull: 5, push: 5, frontLever: 0, backLever: 0, core: 0 } }
    const r = [{ exercise: 'x', progression: 'pull' as const, reps: [10] }]
    s = applySessionResults(s, 'a', r)
    s = applySessionResults(s, 'b', r)
    expect(s.stages.pull).toBe(5) // nur über Test
    s = applyStrengthTest(s, { date: 'c', pullUps: 9, dips: 12, hollowHoldSec: 40, frontLeverStage: 0, frontLeverHoldSec: 0, backLeverStage: 0, backLeverHoldSec: 0 })
    expect(s.stages.pull).toBe(5)
    s = applyStrengthTest(s, { date: 'd', pullUps: 10, dips: 10, hollowHoldSec: 40, frontLeverStage: 0, frontLeverHoldSec: 0, backLeverStage: 0, backLeverHoldSec: 0 })
    expect(s.stages.pull).toBe(6)
    expect(stageOf(s, 'pull').name).toMatch(/Explosive/)
  })
  it('Krafttest setzt Anfänger passend ein und stuft nie ab', () => {
    let s = applyStrengthTest(initialStrengthState(), { date: 'a', pullUps: 3, dips: 2, pushUps: 15, hollowHoldSec: 35, frontLeverStage: 1, frontLeverHoldSec: 8, backLeverStage: 0, backLeverHoldSec: 25 })
    expect(s.stages.pull).toBe(4)
    expect(s.stages.push).toBe(3)
    expect(s.stages.frontLever).toBe(1)
    expect(s.stages.backLever).toBe(1)
    s = applyStrengthTest(s, { date: 'b', pullUps: 0, dips: 0, hollowHoldSec: 5, frontLeverStage: 0, frontLeverHoldSec: 0, backLeverStage: 0, backLeverHoldSec: 0 })
    expect(s.stages.pull).toBe(4)
  })
  it('Einheit enthält Versuch der nächsten Stufe nur kurz vor dem Aufstieg', () => {
    const s: StrengthState = { ...initialStrengthState(), streak: { pull: 1, push: 0, frontLever: 0, backLever: 0, core: 0 } }
    const sess = caliMain({ ...ctx('2026-11-17'), strength: s })
    expect(sess.exercises!.filter((e) => e.attempt).map((e) => e.progression)).toEqual(['pull'])
    expect(caliMain(ctx('2026-11-17')).exercises!.some((e) => e.attempt)).toBe(false)
  })
})
