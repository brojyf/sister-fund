import { describe, expect, it } from 'vitest'
import { buildTradeMarkers, withTradeDates, type Trade } from './trades'
import type { AccountReturnPoint } from './fund'

/** 隔日粒度，跟 SnapTrade 返回的一样 */
const points: AccountReturnPoint[] = [
  { date: '2026-07-15', returnRate: 0 },
  { date: '2026-07-17', returnRate: 0.05 },
  { date: '2026-07-19', returnRate: 0.03 },
]

function trade(date: string, action: Trade['action'], symbol = 'AAPL'): Trade {
  return { date, action, symbol, units: 1, price: 100 }
}

describe('成交日补进曲线', () => {
  it('空档日的成交补出一个点，收益率按前后两个快照线性插值', () => {
    const series = withTradeDates(points, [trade('2026-07-16', 'BUY')])

    expect(series.map((point) => point.date)).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-19',
    ])
    expect(series[1].returnRate).toBeCloseTo(0.025, 10)
  })

  it('真实快照的值一个都不动', () => {
    const series = withTradeDates(points, [trade('2026-07-16', 'BUY')])

    for (const point of points) {
      expect(series.find((candidate) => candidate.date === point.date)).toEqual(point)
    }
  })

  it('成交日已经在曲线上就不补', () => {
    expect(withTradeDates(points, [trade('2026-07-17', 'BUY')])).toBe(points)
  })

  it('早于第一个或晚于最后一个快照的成交没法插值，不补', () => {
    expect(withTradeDates(points, [trade('2026-07-01', 'BUY')])).toBe(points)
    expect(withTradeDates(points, [trade('2026-07-25', 'BUY')])).toBe(points)
  })

  it('没有曲线就没得补', () => {
    expect(withTradeDates([], [trade('2026-07-16', 'BUY')])).toEqual([])
  })
})

describe('买卖打点', () => {
  it('圆点落在成交当天', () => {
    const trades = [trade('2026-07-16', 'BUY')]
    const markers = buildTradeMarkers(trades, withTradeDates(points, trades))

    expect(markers).toHaveLength(1)
    expect(markers[0].date).toBe('2026-07-16')
  })

  it('同一天的多笔交易合成一个打点', () => {
    const markers = buildTradeMarkers(
      [trade('2026-07-17', 'BUY'), trade('2026-07-17', 'SELL', 'TSLA')],
      points,
    )

    expect(markers).toHaveLength(1)
    expect(markers[0].trades).toHaveLength(2)
    expect(markers[0].side).toBe('both')
  })

  it('只买是 buy，只卖是 sell', () => {
    expect(buildTradeMarkers([trade('2026-07-15', 'BUY')], points)[0].side).toBe('buy')
    expect(buildTradeMarkers([trade('2026-07-15', 'SELL')], points)[0].side).toBe('sell')
  })

  it('晚于最后一个快照的交易先不画，等下次同步', () => {
    expect(buildTradeMarkers([trade('2026-07-25', 'BUY')], points)).toEqual([])
  })

  it('没有曲线就没有打点', () => {
    expect(buildTradeMarkers([trade('2026-07-15', 'BUY')], [])).toEqual([])
  })

  it('打点按日期排序', () => {
    const markers = buildTradeMarkers(
      [trade('2026-07-19', 'SELL'), trade('2026-07-15', 'BUY')],
      points,
    )

    expect(markers.map((marker) => marker.date)).toEqual(['2026-07-15', '2026-07-19'])
  })
})
