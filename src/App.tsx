import { useMemo, useState } from 'react'
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
import { brokerAdjustments, fundCashFlows, rawSnapshots, snapshots } from './lib/fundData'
import './App.css'

// 妹妹的钱记人民币，收益率来自 Robinhood 账户
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

/** Robinhood 账户是美元的，对账图单独用 */
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
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

function formatAxisDate(date: string): string {
  return `${Number(date.split('-')[1])} 月`
}

/** 每个自然月在数据里的第一天，用作 X 轴刻度，避免逐日刻度挤成一团 */
function monthStartTicks(dates: string[]): string[] {
  const seen = new Set<string>()
  return dates.filter((date) => {
    const key = date.slice(0, 7)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

interface ChartPoint {
  date: string
  equity: number
  floorEquity: number
  /** 不保底也不抽成的话她会有多少钱 */
  grossEquity: number
  /** 累计收益率，百分比。加钱不会让它跳变 */
  equityRate: number
  floorRate: number
  grossRate: number
}

type ChartMode = 'rate' | 'money'

const CHART_SERIES: Record<
  ChartMode,
  { equity: keyof ChartPoint; floor: keyof ChartPoint; gross: keyof ChartPoint }
> = {
  rate: { equity: 'equityRate', floor: 'floorRate', gross: 'grossRate' },
  money: { equity: 'equity', floor: 'floorEquity', gross: 'grossEquity' },
}

export default function App() {
  const [showReal, setShowReal] = useState(false)
  // 默认走收益率：加钱会让金额曲线出现悬崖，把之前的走势压成一条直线
  const [chartMode, setChartMode] = useState<ChartMode>('rate')

  const { chartData, summary, latestDate, cashFlowRecords } = useMemo(() => {
    const points = buildFundSeries({ snapshots, brokerAdjustments, fundCashFlows })
    const chartData: ChartPoint[] = points.map((point) => ({
      date: point.date,
      equity: point.equity,
      floorEquity: point.units * point.floorNav,
      grossEquity: point.units * point.grossNav,
      equityRate: (point.displayNav - 1) * 100,
      floorRate: (point.floorNav - 1) * 100,
      grossRate: (point.grossNav - 1) * 100,
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
          <h1>妹妹的基金</h1>
          <p className="masthead__latin">A Fund for My Sister</p>
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

      <div className="modes" role="group" aria-label="曲线口径">
        <button
          type="button"
          className={chartMode === 'rate' ? 'modes__btn modes__btn--on' : 'modes__btn'}
          onClick={() => setChartMode('rate')}
        >
          收益率
        </button>
        <button
          type="button"
          className={chartMode === 'money' ? 'modes__btn modes__btn--on' : 'modes__btn'}
          onClick={() => setChartMode('money')}
        >
          金额
        </button>
      </div>

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
              ticks={monthStartTicks(chartData.map((point) => point.date))}
              tickFormatter={formatAxisDate}
              tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
              axisLine={{ stroke: '#ddd2be' }}
              tickLine={false}
            />
            <YAxis
              domain={
                chartMode === 'rate'
                  ? ['dataMin - 0.5', 'dataMax + 0.5']
                  : ['dataMin - 400', 'dataMax + 400']
              }
              tickFormatter={(value: number) =>
                chartMode === 'rate'
                  ? `${value.toFixed(1)}%`
                  : Math.round(value).toLocaleString('en-US')
              }
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
                    <p className="tip__amount">
                      {chartMode === 'rate'
                        ? `${point.equityRate >= 0 ? '+' : ''}${point.equityRate.toFixed(2)}%`
                        : money.format(point.equity)}
                    </p>
                    {onFloor && <p className="tip__floored">保底生效中</p>}
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey={CHART_SERIES[chartMode].equity}
              stroke="#b4552e"
              strokeWidth={2}
              fill="url(#equityFill)"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey={CHART_SERIES[chartMode].floor}
              stroke="#a99d8c"
              strokeWidth={1.25}
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
            {showReal && (
              <Line
                type="monotone"
                dataKey={CHART_SERIES[chartMode].gross}
                stroke="#6b6055"
                strokeWidth={1}
                strokeDasharray="1 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {cashFlowRecords
              .filter((record) => record.date !== chartData[0]?.date)
              .map((record) => (
                <ReferenceDot
                  key={record.date}
                  x={record.date}
                  y={chartMode === 'rate' ? (record.nav - 1) * 100 : record.equityAfter}
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
        {showReal && (
          <li>
            <span className="swatch swatch--real" /> 原始表现（不保底不抽成）
          </li>
        )}
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

      {showReal && (
        <section className="reconcile" aria-label="Robinhood 账户走势">
          <h2 className="reconcile__title">Robinhood 账户走势</h2>
          <p className="reconcile__note">
            账户原始总资产，美元。这条线应该和 Robinhood App 里看到的一致 ——
            妹妹的收益率就是从它推出来的。
          </p>
          <div className="reconcile__chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rawSnapshots}
                margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              >
                <CartesianGrid stroke="#ddd2be" strokeDasharray="1 6" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={monthStartTicks(rawSnapshots.map((point) => point.date))}
                  tickFormatter={formatAxisDate}
                  tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
                  axisLine={{ stroke: '#ddd2be' }}
                  tickLine={false}
                />
                <YAxis
                  domain={['dataMin - 50', 'dataMax + 50']}
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
                    const point = payload[0].payload as { totalValue: number }
                    return (
                      <div className="tip">
                        <p className="tip__date">{formatChineseDate(String(label))}</p>
                        <p className="tip__amount">{usd.format(point.totalValue)}</p>
                      </div>
                    )
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="totalValue"
                  stroke="#6b6055"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

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

      <footer className="colophon">
        <p>
          每个月至少 {(MONTHLY_FLOOR_RATE * 100).toFixed(1)}% 收益，跌了哥哥补；
          超过的部分哥哥拿 {(PERFORMANCE_FEE_RATE * 100).toFixed(0)}%。
          {summary.isFloored && <strong> 这个月正在走保底。</strong>}
        </p>
        <button type="button" className="toggle" onClick={() => setShowReal((on) => !on)}>
          {showReal ? '收起对账视图' : '对账视图'}
        </button>
      </footer>
    </main>
  )
}
