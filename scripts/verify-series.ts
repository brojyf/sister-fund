/**
 * 把真实数据算出来的每日净值打印出来，用于人工对账。
 *
 *   npm run verify
 *
 * 重点看两件事：
 *   1. 「当期涨跌」那列有没有跟行情无关的大数
 *   2. 毛毛的钱在账户走平/下跌时是不是贴着保底线（毛毛的钱 ≈ 保底）
 *
 * 「参考净值」那两列是「开张就放进去 1 块钱现在值多少」，只作整体口径参考 ——
 * 真正的钱是按笔记账的，每笔从自己进来那天起各长各的保底线。
 */
import { buildFundSeries, describeCashFlows } from '../src/lib/fund'
import { fundCashFlows, snapshots } from '../src/lib/fundData'

const points = buildFundSeries({ snapshots, fundCashFlows })

const valueByDate = new Map(snapshots.map((s) => [s.date, s.totalValue]))

console.log('日期        账户总值   当期涨跌   真实净值   参考净值  保底   毛毛的钱      保底线')
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
      point.equity.toFixed(2).padStart(11),
      point.floorEquity.toFixed(2).padStart(11),
    ].join('  '),
  )
})

const last = points[points.length - 1]
const principal = fundCashFlows.reduce((sum, flow) => sum + flow.amount, 0)
console.log(`\n账户真实累计收益率  ${((last.realNav - 1) * 100).toFixed(2)}%`)
console.log(
  `毛毛拿到的收益率    ${((last.equity / principal - 1) * 100).toFixed(2)}%（保底托底 + 超额抽成后）`,
)
console.log(`本金 ${principal.toFixed(2)}  →  现在 ${last.equity.toFixed(2)}`)
console.log(`累计抽成 ${last.feeAccrued.toFixed(2)}`)

console.log('\n逐笔：')
for (const record of describeCashFlows(points, fundCashFlows)) {
  const rate = record.returnRate === null ? '  —' : `${(record.returnRate * 100).toFixed(3)}%`
  const gain = record.gain === null ? '  —' : record.gain.toFixed(2)
  console.log(
    `  ${record.date}  ${record.amount.toFixed(2).padStart(10)}  ${rate.padStart(9)}  ${gain.padStart(9)}  ${record.note ?? ''}`,
  )
}
