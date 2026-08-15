import { describe, expect, it } from 'vitest'
import { mergeSnapshots } from './snapshot-history.mjs'

describe('账户快照按天沉淀', () => {
  it('每天跑一次，点数逐日累积而不是被覆写', () => {
    const dayOne = mergeSnapshots([], { date: '2026-08-15', totalValue: 2_160 })
    const dayTwo = mergeSnapshots(dayOne, { date: '2026-08-16', totalValue: 2_170 })

    expect(dayTwo).toEqual([
      { date: '2026-08-15', totalValue: 2_160 },
      { date: '2026-08-16', totalValue: 2_170 },
    ])
  })

  it('手工核对过的历史值不会被后来的 sync 冲掉', () => {
    const recorded = [
      { date: '2026-07-15', totalValue: 2_000 },
      { date: '2026-08-15', totalValue: 2_132.98 },
    ]
    const merged = mergeSnapshots(recorded, { date: '2026-08-16', totalValue: 2_150 })

    expect(merged[0]).toEqual({ date: '2026-07-15', totalValue: 2_000 })
    expect(merged).toHaveLength(3)
  })

  it('当天可以被实时余额刷新，一天里跑两次拿到新值', () => {
    const recorded = [{ date: '2026-08-15', totalValue: 2_160 }]
    const merged = mergeSnapshots(recorded, { date: '2026-08-15', totalValue: 2_188 })

    expect(merged).toEqual([{ date: '2026-08-15', totalValue: 2_188 }])
  })

  it('拿不到实时余额时不写空点', () => {
    const recorded = [{ date: '2026-08-14', totalValue: 2_150 }]

    expect(mergeSnapshots(recorded, null)).toEqual(recorded)
  })
})
