/**
 * 把真实数据算出来的每日净值打印出来，用于人工对账。
 *
 *   npm run verify
 *
 * 重点看两件事：
 *   1. 账户里我个人的转账和月费有没有被误算成盈亏 —— 漏写 adjustment.json
 *      的日子会在「当期涨跌」那列冒出一个跟行情无关的大数
 *   2. 展示净值在账户走平/下跌时是不是贴着保底线
 */
import { buildFundSeries } from '../src/lib/fund'
import { brokerAdjustments, fundCashFlows, snapshots } from '../src/lib/fundData'

const points = buildFundSeries({ snapshots, brokerAdjustments, fundCashFlows })

const valueByDate = new Map(snapshots.map((s) => [s.date, s.totalValue]))

console.log('日期        账户总值   当期涨跌   真实净值   展示净值  保底  毛毛的钱')
points.forEach((point, index) => {
  const accountValue = valueByDate.get(point.date) ?? 0
  const step = index === 0 ? 0 : point.realNav / points[index - 1].realNav - 1
  console.log(
    [
      point.date,
      accountValue.toFixed(2).padStart(9),
      `${(step * 100).toFixed(2)}%`.padStart(9),
      point.realNav.toFixed(5).padStart(9),
      point.displayNav.toFixed(5).padStart(9),
      point.isFloored ? ' 是 ' : ' -- ',
      point.equity.toFixed(2).padStart(10),
    ].join('  '),
  )
})

const last = points[points.length - 1]
const principal = fundCashFlows.reduce((sum, flow) => sum + flow.amount, 0)
console.log(`\n账户真实累计收益率  ${((last.realNav - 1) * 100).toFixed(2)}%`)
console.log(`毛毛拿到的收益率    ${((last.displayNav - 1) * 100).toFixed(2)}%（保底托底 + 超额抽成后）`)
console.log(`本金 ${principal.toFixed(2)}  →  现在 ${last.equity.toFixed(2)}`)
console.log(`累计抽成 ${last.feeAccrued.toFixed(2)}`)
