import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import App from './App'
import { money, percent, signedMoney } from './lib/format'

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

it('页面同时展示实际持有份额、原始亏损和保底后的正结算收益', () => {
  const html = renderToStaticMarkup(<App />)

  expect(html).toContain('持有 1,000 份')
  expect(html).toContain(`原始市值 ${money.format(1_000)}`)
  expect(html).toContain('净值 1.1000')
  expect(html).toContain('原始收益率</th>')
  expect(html).toContain('结算收益率</th>')
  expect(html).toContain(`<td>${signedMoney.format(-100)}</td>`)
  expect(html).toContain(`<td>${percent.format(2_000 / 2_200 - 1)}</td>`)
  expect(html).toContain(`<td>${signedMoney.format(0.11)}</td>`)
  expect(html).toContain(`<td>${percent.format(0.0001)}</td>`)
  expect(html).toContain('总份额不变')
})
