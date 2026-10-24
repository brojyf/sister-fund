import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import App from './App'
import { percent, signedMoney } from './lib/format'
vi.mock('./lib/fundData', () => {
  const snapshots = [
    { date: '2026-01-05', totalValue: 2_000 },
    { date: '2026-01-06', totalValue: 2_200 },
    { date: '2026-01-07', totalValue: 2_000 },
  ]
  return {
    snapshots,
    rawSnapshots: snapshots,
    ACCOUNT_BASE_CAPITAL: 2_000,
    fundCashFlows: [{ date: '2026-01-06', amount: 1_100 }],
  }
})

it('页面展示持有份额、每笔赚到的钱和收益率，取钱的收益留空', () => {
  const html = renderToStaticMarkup(<App />)

  expect(html).toContain('持有 1,000 份')
  expect(html).toContain('收益</th>')
  expect(html).toContain('收益率</th>')
  expect(html).toContain(`<td>${signedMoney.format(0.11)}</td>`)
  expect(html).toContain(`<td>${percent.format(0.0001)}</td>`)
  expect(html).toContain('总份额不变')
})
