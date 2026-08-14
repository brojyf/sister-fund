import { describe, expect, it } from 'vitest'
import { buildTradeMarkers, type Trade } from './trades'
import type { AccountSnapshot } from './fund'

/** 隔日粒度，跟 SnapTrade 返回的一样 */
const snapshots: AccountSnapshot[] = [
  { date: '2026-07-15', totalValue: 2000 },
  { date: '2026-07-17', totalValue: 2100 },
  { date: '2026-07-19', totalValue: 2050 },
]

function trade(date: string, action: Trade['action'], symbol = 'AAPL'): Trade {
  return { date, action, symbol, units: 1, price: 100 }
}

describe('买卖打点', () => {
  it('交易日没有快照时挂到之后最近的一个快照上', () => {
    const markers = buildTradeMarkers([trade('2026-07-16', 'BUY')], snapshots)

    expect(markers).toHaveLength(1)
    expect(markers[0].date).toBe('2026-07-17')
    expect(markers[0].totalValue).toBe(2100)
  })

  it('同一个快照日上的多笔交易合成一个打点', () => {
    const markers = buildTradeMarkers(
      [trade('2026-07-16', 'BUY'), trade('2026-07-17', 'SELL', 'TSLA')],
      snapshots,
    )

    expect(markers).toHaveLength(1)
    expect(markers[0].trades).toHaveLength(2)
    expect(markers[0].side).toBe('both')
  })

  it('只买是 buy，只卖是 sell', () => {
    expect(buildTradeMarkers([trade('2026-07-15', 'BUY')], snapshots)[0].side).toBe('buy')
    expect(buildTradeMarkers([trade('2026-07-15', 'SELL')], snapshots)[0].side).toBe('sell')
  })

  it('晚于最后一个快照的交易先不画，等下次同步', () => {
    expect(buildTradeMarkers([trade('2026-07-25', 'BUY')], snapshots)).toEqual([])
  })

  it('没有快照就没有打点', () => {
    expect(buildTradeMarkers([trade('2026-07-15', 'BUY')], [])).toEqual([])
  })

  it('打点按日期排序', () => {
    const markers = buildTradeMarkers(
      [trade('2026-07-19', 'SELL'), trade('2026-07-15', 'BUY')],
      snapshots,
    )

    expect(markers.map((marker) => marker.date)).toEqual(['2026-07-15', '2026-07-19'])
  })
})
