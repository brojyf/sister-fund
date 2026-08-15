import { describe, expect, it } from 'vitest'
import { mergeSnapshots } from './snapshot-history.mjs'

describe('账户快照按天沉淀', () => {
  it('每天跑一次，点数逐日累积而不是被覆写', () => {
    // balanceHistory 永远只给这两个隔日估算点
    const estimated = [
      { date: '2026-08-12', totalValue: 2_100 },
      { date: '2026-08-14', totalValue: 2_150 },
    ]

    const dayOne = mergeSnapshots([], estimated, { date: '2026-08-15', totalValue: 2_160 })
    const dayTwo = mergeSnapshots(dayOne, estimated, {
      date: '2026-08-16',
      totalValue: 2_170,
    })

    expect(dayOne.map((point) => point.date)).toEqual([
      '2026-08-12',
      '2026-08-14',
      '2026-08-15',
    ])
    expect(dayTwo.map((point) => point.date)).toEqual([
      '2026-08-12',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ])
  })

  it('已落盘的点不会被后来的估算改写', () => {
    const recorded = [{ date: '2026-08-15', totalValue: 2_160 }]
    // 几天后 balanceHistory 对同一天给出了不一样的估算
    const merged = mergeSnapshots(recorded, [{ date: '2026-08-15', totalValue: 2_099 }], null)

    expect(merged).toEqual([{ date: '2026-08-15', totalValue: 2_160 }])
  })

  it('当天可以被实时余额刷新，一天里跑两次拿到新值', () => {
    const recorded = [{ date: '2026-08-15', totalValue: 2_160 }]
    const merged = mergeSnapshots(recorded, [], { date: '2026-08-15', totalValue: 2_188 })

    expect(merged).toEqual([{ date: '2026-08-15', totalValue: 2_188 }])
  })

  it('拿不到实时余额时不写空点', () => {
    const merged = mergeSnapshots([], [{ date: '2026-08-14', totalValue: 2_150 }], null)

    expect(merged).toEqual([{ date: '2026-08-14', totalValue: 2_150 }])
  })
})
