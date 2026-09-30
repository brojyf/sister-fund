import { expect, it } from 'vitest'
import { mergeSnapshots } from './snapshot-history.mjs'
import { buildFundSeries, summarize } from '../src/lib/fund'

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
