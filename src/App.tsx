import { useMemo } from 'react'
import {
  buildAccountReturnSeries,
  buildFundSeries,
  describeCashFlows,
  summarize,
  DAILY_FLOOR_RATE,
  PERFORMANCE_FEE_RATE,
  type AccountReturnPoint,
} from './lib/fund'
import { ACCOUNT_BASE_CAPITAL, fundCashFlows, rawSnapshots, snapshots } from './lib/fundData'
import { formatChineseDate, money, percent, signedMoney } from './lib/format'
import { AccountChart } from './components/AccountChart'
import { EquityChart, type EquityPoint } from './components/EquityChart'
import './App.css'

export default function App() {
  const { equityPoints, accountPoints, summary, latestDate, cashFlowRecords } = useMemo(() => {
    const points = buildFundSeries({ snapshots, fundCashFlows })
    const equityPoints: EquityPoint[] = points.map((point) => ({
      date: point.date,
      equity: point.equity,
      floorEquity: point.units * point.floorNav,
    }))
    // 账户曲线画的是总资产比起始资金的涨跌幅，不剔资金进出 ——
    // 只吃 account.json，永远画到最新一个快照日
    const accountPoints: AccountReturnPoint[] = buildAccountReturnSeries(
      rawSnapshots,
      ACCOUNT_BASE_CAPITAL,
    )
    return {
      equityPoints,
      accountPoints,
      summary: summarize(points, fundCashFlows),
      latestDate: points[points.length - 1]?.date ?? '',
      cashFlowRecords: describeCashFlows(points, fundCashFlows),
    }
  }, [])

  if (!summary) return null

  const dayIsUp = summary.dayGain >= 0

  return (
    <main className="sheet">
      <header className="masthead">
        <div className="masthead__title">
          <h1>毛毛基金</h1>
          <p className="masthead__latin">Maomao Fund</p>
        </div>
        <time className="masthead__date">{formatChineseDate(latestDate)}</time>
      </header>

      <section className="hero">
        <p className="hero__label">今天你有</p>
        <p className="hero__amount">{money.format(summary.equity)}</p>
        <p className="hero__deltas">
          <span className={dayIsUp ? 'delta delta--up' : 'delta delta--down'}>
            {dayIsUp ? '▲' : '▼'} 今日 {signedMoney.format(summary.dayGain)}
          </span>
          <span className="delta__divider" aria-hidden="true" />
          <span className="delta">累计赚 {signedMoney.format(summary.totalGain)}</span>
          <span className="delta__divider" aria-hidden="true" />
          <span className="delta">{percent.format(summary.totalReturnRate)}</span>
        </p>
      </section>

      <section className="panel" aria-label="你的资产">
        <h2 className="panel__title">你的资产</h2>
        <div className="panel__chart">
          <EquityChart points={equityPoints} />
        </div>
        <ul className="legend">
          <li>
            <span className="swatch swatch--equity" /> 你的资产
          </li>
          <li>
            <span className="swatch swatch--floor" /> 保底线
          </li>
        </ul>
      </section>

      <section className="panel" aria-label="托管账户走势">
        <h2 className="panel__title">托管账户走势</h2>
        <div className="panel__chart">
          <AccountChart points={accountPoints} />
        </div>
        <ul className="legend">
          <li>
            <span className="swatch swatch--account" /> 相对本金 ${ACCOUNT_BASE_CAPITAL.toLocaleString('en-US')} 的涨跌幅
          </li>
        </ul>
      </section>

      <section className="flows" aria-label="资金流水">
        <h2 className="flows__title">资金流水</h2>
        <table className="flows__table">
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">金额</th>
              <th scope="col">赚了</th>
              <th scope="col">收益率</th>
            </tr>
          </thead>
          <tbody>
            {cashFlowRecords.map((record) => (
              <tr key={record.date}>
                <td>{formatChineseDate(record.date)}</td>
                <td className={record.amount > 0 ? 'flows__in' : 'flows__out'}>
                  {record.amount > 0 ? '加钱 ' : '取钱 '}
                  {signedMoney.format(record.amount)}
                </td>
                <td>{record.gain === null ? '—' : signedMoney.format(record.gain)}</td>
                <td>{record.returnRate === null ? '—' : percent.format(record.returnRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rules" aria-label="规则">
        <h2 className="rules__title">规则</h2>
        <ul className="rules__list">
          <li>
            <strong>每天保底 {(DAILY_FLOOR_RATE * 100).toFixed(2)}%</strong>
            ——按自然日累加，一个月约 {(((1 + DAILY_FLOOR_RATE) ** 30 - 1) * 100).toFixed(2)}%。
            跑输的差额由管理人补足，你的资产不会跌破保底线。
            {summary.isFloored && <em> 现在正在走保底。</em>}
          </li>
          <li>
            <strong>超额分成 {(PERFORMANCE_FEE_RATE * 100).toFixed(0)}%</strong>
            ——超过保底的部分，管理人分走一半，其余全部归你。
          </li>
          <li>
            <strong>按自然月结算</strong>
            ——每个月初重新起算。上个月已经到手的收益，不会被这个月的回撤吃掉。
          </li>
          <li>
            <strong>加钱按当天净值折算份额</strong>
            ——加进来的钱只增加本金，不会凭空多出收益，也不会拉低你已有的收益率。
          </li>
          <li>
            <strong>每天自动更新</strong>
            ——净值跟随托管账户每日同步，人民币计价。
          </li>
        </ul>
      </section>

      <footer className="footer">有问题微信联系</footer>
    </main>
  )
}
