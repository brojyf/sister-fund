import { useMemo } from 'react'
import {
  buildAccountReturnSeries,
  buildFundSeries,
  describeCashFlows,
  summarize,
  summarizeAccountReturn,
  DAILY_FLOOR_RATE,
  PERFORMANCE_FEE_RATE,
  type AccountReturnPoint,
} from './lib/fund'
import { ACCOUNT_BASE_CAPITAL, fundCashFlows, rawSnapshots, snapshots } from './lib/fundData'
import { formatChineseDate, formatShortDate, money, percent, signedMoney } from './lib/format'
import { AccountChart } from './components/AccountChart'
import { EquityChart, type EquityPoint } from './components/EquityChart'
import './App.css'

const shareQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 })

export default function App() {
  const { equityPoints, accountPoints, accountReturn, summary, latestDate, cashFlowRecords } = useMemo(() => {
    const points = buildFundSeries({ snapshots, fundCashFlows })
    const equityPoints: EquityPoint[] = points.map((point) => ({
      date: point.date,
      equity: point.equity,
      floorEquity: point.floorEquity,
    }))
    // 账户曲线画的是总资产比起始资金的涨跌幅，不剔资金进出 ——
    // 只吃 account.json，永远画到最新一个快照日；流水只是标在线上的点
    const accountPoints: AccountReturnPoint[] = buildAccountReturnSeries(
      rawSnapshots,
      ACCOUNT_BASE_CAPITAL,
      fundCashFlows,
    )
    return {
      equityPoints,
      accountPoints,
      accountReturn: summarizeAccountReturn(accountPoints),
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
        <div className="masthead__brand">
          <img className="masthead__icon" src="/favicon-maomao.png" alt="" width="56" height="56" />
          <div className="masthead__title">
            <h1>毛毛基金</h1>
            <p className="masthead__latin">Maomao Fund</p>
          </div>
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
          <span className="delta">结算收益 {signedMoney.format(summary.totalGain)}</span>
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
        <div className="panel__head">
          <h2 className="panel__title">托管账户走势</h2>
          {accountReturn && (
            <p className="panel__stats">
              <span className={accountReturn.dayChange >= 0 ? 'delta delta--up' : 'delta delta--down'}>
                {accountReturn.dayChange >= 0 ? '▲' : '▼'} 今日 {percent.format(accountReturn.dayChange)}
              </span>
              <span className="delta__divider" aria-hidden="true" />
              <span
                className={
                  accountReturn.totalReturnRate >= 0 ? 'delta delta--up' : 'delta delta--down'
                }
              >
                {percent.format(accountReturn.totalReturnRate)}
              </span>
            </p>
          )}
        </div>
        <div className="panel__chart">
          <AccountChart points={accountPoints} />
        </div>
        <ul className="legend">
          <li>
            <span className="swatch swatch--flow-in" /> 买入
          </li>
          <li>
            <span className="swatch swatch--flow-out" /> 卖出
          </li>
        </ul>
      </section>

      <section className="flows" aria-label="资金流水">
        <h2 className="flows__title">资金流水</h2>
        <p className="flows__holding">持有 {shareQuantity.format(summary.shares)} 份</p>
        <div className="flows__scroll" role="region" aria-label="份额与收益明细" tabIndex={0}>
          <table className="flows__table">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">买入 / 卖出</th>
                <th scope="col">收益</th>
                <th scope="col">收益率</th>
              </tr>
            </thead>
            <tbody>
              {cashFlowRecords.map((record, index) => (
                <tr key={`${record.date}-${index}`}>
                  <td>{formatShortDate(record.date)}</td>
                  <td className={record.amount > 0 ? 'flows__in' : 'flows__out'}>
                    {signedMoney.format(record.amount)}
                  </td>
                  <td>{record.gain === null ? '—' : signedMoney.format(record.gain)}</td>
                  <td>{record.returnRate === null ? '—' : percent.format(record.returnRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rules" aria-label="规则">
        <h2 className="rules__title">规则</h2>
        <ul className="rules__list">
          {/* 正文一律写成一整行：JSX 里换行会被拼成半角空格，落在中文句中很难看 */}
          <li>
            <strong>每天保底 {(DAILY_FLOOR_RATE * 100).toFixed(2)}%</strong>
            <span className="rules__dash">——</span>
            {`按自然日累加，一个月约 ${(((1 + DAILY_FLOOR_RATE) ** 30 - 1) * 100).toFixed(2)}%。跑输的差额由管理人补足，你的资产不会跌破保底线。`}
            {summary.isFloored && <em> 现在正在走保底。</em>}
          </li>
          <li>
            <strong>超额分成 {(PERFORMANCE_FEE_RATE * 100).toFixed(0)}%</strong>
            <span className="rules__dash">——</span>
            超过保底的部分，管理人分走一半，其余全部归你。
          </li>
          <li>
            <strong>按当天账户净值买入已有份额</strong>
            <span className="rules__dash">——</span>
            购买的是管理人已有的份额，购买款不进入托管账户，总份额不变。买入金额除以当天账户原始净值得到份额，买入前的涨跌与你无关。
          </li>
          <li>
            <strong>收益怎么算</strong>
            <span className="rules__dash">——</span>
            每笔钱从买入那天起单独计算：跑输保底线时按保底线结算，差额由管理人补足；跑赢时超出保底的部分管理人分走一半。不按月重置，任何时候都按当天的数结算。
          </li>
          <li>
            <strong>每天自动更新</strong>
            <span className="rules__dash">——</span>
            净值跟随托管账户每日同步，初始净值为 1；人民币计价，按固定汇率计算，不计汇兑损益。
          </li>
          <li>
            <strong>收益次日早上 7 点刷新</strong>
            <span className="rules__dash">——</span>
            美股每个交易日的收益，在北京时间第二天早上 7 点更新到页面上；美股休市（周末和节假日）期间不更新。
          </li>
        </ul>
      </section>

      <footer className="footer">有问题微信联系</footer>
    </main>
  )
}
