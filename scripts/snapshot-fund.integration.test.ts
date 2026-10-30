import { expect, it } from 'vitest'
import { mergeSnapshots } from './snapshot-history.mjs'
import { buildAccountReturnSeries, buildFundSeries, summarize } from '../src/lib/fund'

it('snapshot refresh flows into fund valuation without duplicating a day', () => {
  const history = [{ date: '2026-08-17', totalValue: 2_000 }]
  const next = mergeSnapshots(history, { date: '2026-08-18', totalValue: 2_100 })
  const refreshed = mergeSnapshots(next, { date: '2026-08-18', totalValue: 2_200 })
  const flows = [{ date: '2026-08-17', amount: 1_000 }]
  const points = buildFundSeries({ snapshots: refreshed, fundCashFlows: flows })
  const summary = summarize(points, flows)

  expect(points.map((point) => point.date)).toEqual(['2026-08-17', '2026-08-18'])
  expect(points.at(-1)?.realNav).toBeCloseTo(1.1, 10)
  expect(summary?.principal).toBe(1_000)
  expect(summary?.equity).toBeGreaterThan(1_000)
  expect(history).toEqual([{ date: '2026-08-17', totalValue: 2_000 }])
})

it('矫正后的余额同时进入账户曲线和妹妹净值，历史不受影响', () => {
  const history = [{ date: '2026-10-29', totalValue: 2_000 }]
  const snapshots = mergeSnapshots(history, { date: '2026-10-30', totalValue: 4_200 })
  const points = buildFundSeries({
    snapshots,
    fundCashFlows: [{ date: '2026-10-29', amount: 1_000 }],
  })
  const accountPoints = buildAccountReturnSeries(snapshots, 2_000)

  expect(snapshots).toEqual([
    ...history,
    { date: '2026-10-30', totalValue: 2_200 },
  ])
  expect(points.at(-1)?.realNav).toBeCloseTo(1.1, 10)
  expect(accountPoints.at(-1)?.returnRate).toBeCloseTo(0.1, 10)
  expect(history).toEqual([{ date: '2026-10-29', totalValue: 2_000 }])
})
