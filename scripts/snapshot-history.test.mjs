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

  it('2026-10-30 美东日期之前不矫正余额', () => {
    expect(mergeSnapshots([], { date: '2026-10-29', totalValue: 4_112.97 })).toEqual([
      { date: '2026-10-29', totalValue: 4_112.97 },
    ])
  })

  it.each(['2026-10-30', '2026-11-02', '2027-01-04'])(
    '%s 的原始余额固定减去 2,000 美元，保留到分',
    (date) => {
      expect(mergeSnapshots([], { date, totalValue: 4_112.97 })).toEqual([
        { date, totalValue: 2_112.97 },
      ])
    },
  )

  it('重复同步使用新原始余额，不累计扣减，也不改写历史', () => {
    const history = [
      { date: '2026-10-29', totalValue: 2_100 },
      { date: '2026-10-30', totalValue: 2_112.97 },
    ]
    const live = { date: '2026-11-02', totalValue: 4_200 }
    const first = mergeSnapshots(history, live)
    expect(mergeSnapshots(first, live)).toEqual(first)

    const refreshed = mergeSnapshots(first, { date: live.date, totalValue: 4_250.50 })
    expect(refreshed).toEqual([
      ...history,
      { date: '2026-11-02', totalValue: 2_250.50 },
    ])
    expect(history).toEqual([
      { date: '2026-10-29', totalValue: 2_100 },
      { date: '2026-10-30', totalValue: 2_112.97 },
    ])
    expect(live).toEqual({ date: '2026-11-02', totalValue: 4_200 })
  })
})
