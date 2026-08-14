import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  buildFundSeries,
  describeCashFlows,
  summarize,
  MONTHLY_FLOOR_RATE,
  PERFORMANCE_FEE_RATE,
} from './lib/fund'
import { brokerAdjustments, fundCashFlows, snapshots } from './lib/fundData'
import './App.css'

// 毛毛的钱记人民币，收益率来自 Robinhood 账户
const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
})

const signedMoney = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
  signDisplay: 'always',
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 2,
  signDisplay: 'always',
})

function formatChineseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${year} 年 ${month} 月 ${day} 日`
}

function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}/${day}`
}

/**
 * X 轴刻度随区间长度自适应：跨三个月以上按月首日，否则在整段里均匀取点。
 * 固定按月的话，基金刚起步时整张图只剩一两个刻度。
 */
function axisTicks(dates: string[]): string[] {
  if (dates.length === 0) return []

  const monthStarts = dates.filter(
    (date, index) => index === 0 || date.slice(0, 7) !== dates[index - 1].slice(0, 7),
  )
  if (monthStarts.length >= 3) return monthStarts

  const wanted = Math.min(5, dates.length)
  const step = (dates.length - 1) / (wanted - 1 || 1)
  return Array.from({ length: wanted }, (_, i) => dates[Math.round(i * step)])
}

/** 金额轴上下各留一点余量，曲线不贴着边框 */
function moneyDomain(points: ChartPoint[]): [number, number] {
  const values = points.flatMap((point) => [point.equity, point.floorEquity])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.12, max * 0.01)
  return [min - padding, max + padding]
}

interface ChartPoint {
  date: string
  equity: number
  floorEquity: number
}

export default function App() {
  const { chartData, summary, latestDate, cashFlowRecords } = useMemo(() => {
    const points = buildFundSeries({ snapshots, brokerAdjustments, fundCashFlows })
    const chartData: ChartPoint[] = points.map((point) => ({
      date: point.date,
      equity: point.equity,
      floorEquity: point.units * point.floorNav,
    }))
    return {
      chartData,
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
          <span className="delta">累计 {percent.format(summary.navReturnRate)}</span>
        </p>
      </section>

      <section className="chart" aria-label="资产曲线">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b4552e" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#b4552e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ddd2be" strokeDasharray="1 6" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={axisTicks(chartData.map((point) => point.date))}
              tickFormatter={formatMonthDay}
              tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
              axisLine={{ stroke: '#ddd2be' }}
              tickLine={false}
            />
            <YAxis
              domain={moneyDomain(chartData)}
              tickFormatter={(value: number) => Math.round(value).toLocaleString('en-US')}
              tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: '#a99d8c', strokeDasharray: '2 4' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as ChartPoint
                const onFloor = point.equity - point.floorEquity < 0.01
                return (
                  <div className="tip">
                    <p className="tip__date">{formatChineseDate(String(label))}</p>
                    <p className="tip__amount">{money.format(point.equity)}</p>
                    {onFloor && <p className="tip__floored">保底生效中</p>}
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#b4552e"
              strokeWidth={2}
              fill="url(#equityFill)"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="floorEquity"
              stroke="#a99d8c"
              strokeWidth={1.25}
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
            {cashFlowRecords
              .filter((record) => record.date !== chartData[0]?.date)
              .map((record) => (
                <ReferenceDot
                  key={record.date}
                  x={record.date}
                  y={record.equityAfter}
                  r={4}
                  fill={record.amount > 0 ? '#4a6b4f' : '#a5442f'}
                  stroke="#f7f2e8"
                  strokeWidth={2}
                />
              ))}
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <ul className="legend">
        <li>
          <span className="swatch swatch--equity" /> 你的资产
        </li>
        <li>
          <span className="swatch swatch--floor" /> 保底线
        </li>
        <li>
          <span className="swatch swatch--flow" /> 加钱 / 取钱
        </li>
      </ul>

      <section className="ledger">
        <div className="ledger__cell">
          <p className="ledger__label">本金</p>
          <p className="ledger__value">{money.format(summary.principal)}</p>
        </div>
        <div className="ledger__cell">
          <p className="ledger__label">累计收益</p>
          <p className="ledger__value">{signedMoney.format(summary.totalGain)}</p>
        </div>
        <div className="ledger__cell">
          <p className="ledger__label">每月保底</p>
          <p className="ledger__value">{(MONTHLY_FLOOR_RATE * 100).toFixed(1)}%</p>
        </div>
        <div className="ledger__cell">
          <p className="ledger__label">超额分成</p>
          <p className="ledger__value">{(PERFORMANCE_FEE_RATE * 100).toFixed(0)}%</p>
        </div>
      </section>

      <section className="flows" aria-label="资金流水">
        <h2 className="flows__title">资金流水</h2>
        <table className="flows__table">
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">金额</th>
              <th scope="col">当日净值</th>
              <th scope="col">份额</th>
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
                <td>{record.nav.toFixed(4)}</td>
                <td>
                  {record.units > 0 ? '+' : ''}
                  {record.units.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rules" aria-label="规则">
        <h2 className="rules__title">规则</h2>
        <ul className="rules__list">
          <li>
            <strong>每月保底 {(MONTHLY_FLOOR_RATE * 100).toFixed(1)}%</strong>
            ——跑输了哥哥补足，你的钱不会跌破保底线。
            {summary.isFloored && <em> 这个月正在走保底。</em>}
          </li>
          <li>
            <strong>超额分成 {(PERFORMANCE_FEE_RATE * 100).toFixed(0)}%</strong>
            ——跑赢保底的部分哥哥拿一半，剩下的都是你的。
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
            ——收益率来自哥哥的 Robinhood 账户，按人民币记账。
          </li>
        </ul>
      </section>
    </main>
  )
}
