import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AccountReturnPoint, CashFlow } from '../lib/fund'
import { buildTradeMarkers, withMarkerDates, type Trade } from '../lib/trades'
import {
  axisTicks,
  formatChineseDate,
  formatMonthDay,
  percent,
  signedMoney,
  tightDomain,
} from '../lib/format'

const BUY_COLOR = '#4a6b4f'
const SELL_COLOR = '#a5442f'
const BOTH_COLOR = '#b4552e'

const MARKER_COLOR: Record<string, string> = {
  buy: BUY_COLOR,
  sell: SELL_COLOR,
  both: BOTH_COLOR,
}

interface Props {
  points: AccountReturnPoint[]
  trades: Trade[]
  /** 毛毛的加钱/取钱，只在这条线上标个位置，不影响账户收益率 */
  cashFlows: CashFlow[]
}

/** 托管账户的累计收益率走势，买卖和加钱取钱都打在当天 */
export function AccountChart({ points, trades, cashFlows }: Props) {
  // 要打点的日期先补进曲线，圆点才能落在当天而不是被挪到下一个快照日
  const series = withMarkerDates(points, [
    ...trades.map((trade) => trade.date),
    ...cashFlows.map((flow) => flow.date),
  ])
  const markers = buildTradeMarkers(trades, series)
  const markersByDate = new Map(markers.map((marker) => [marker.date, marker]))
  const returnByDate = new Map(series.map((point) => [point.date, point.returnRate]))
  const flowsByDate = new Map(cashFlows.map((flow) => [flow.date, flow]))
  const plottedFlows = cashFlows.filter((flow) => returnByDate.has(flow.date))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="accountFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6b6055" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#6b6055" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ddd2be" strokeDasharray="1 6" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={axisTicks(points.map((point) => point.date))}
          tickFormatter={formatMonthDay}
          tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
          axisLine={{ stroke: '#ddd2be' }}
          tickLine={false}
        />
        <YAxis
          domain={tightDomain(points.map((point) => point.returnRate))}
          tickFormatter={(value: number) => percent.format(value)}
          tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        {/* 收益率图的零轴是有意义的：线在它上面还是下面，一眼就是赚还是亏 */}
        <ReferenceLine y={0} stroke="#c9bda8" strokeWidth={1} />
        <Tooltip
          cursor={{ stroke: '#a99d8c', strokeDasharray: '2 4' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as AccountReturnPoint
            const marker = markersByDate.get(String(label))
            const flow = flowsByDate.get(String(label))
            return (
              <div className="tip">
                <p className="tip__date">{formatChineseDate(String(label))}</p>
                <p className="tip__amount">{percent.format(point.returnRate)}</p>
                {flow && (
                  <p className={flow.amount > 0 ? 'tip__buy' : 'tip__sell'}>
                    {flow.amount > 0 ? '加钱' : '取钱'} {signedMoney.format(flow.amount)}
                  </p>
                )}
                {marker?.trades.map((trade, index) => (
                  <p
                    key={`${trade.symbol}-${index}`}
                    className={trade.action === 'BUY' ? 'tip__buy' : 'tip__sell'}
                  >
                    {trade.action === 'BUY' ? '买入' : '卖出'} {trade.symbol} {trade.units} 股
                  </p>
                ))}
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="returnRate"
          stroke="#6b6055"
          strokeWidth={1.75}
          fill="url(#accountFill)"
          dot={false}
          isAnimationActive={false}
        />
        {markers.map((marker) => (
          <ReferenceDot
            key={marker.date}
            x={marker.date}
            y={returnByDate.get(marker.date) ?? 0}
            r={4}
            fill={MARKER_COLOR[marker.side]}
            stroke="#f7f2e8"
            strokeWidth={2}
          />
        ))}
        {/* 加钱取钱画成空心圈，跟实心的买卖点区分开 */}
        {plottedFlows.map((flow) => (
          <ReferenceDot
            key={`flow-${flow.date}`}
            x={flow.date}
            y={returnByDate.get(flow.date) ?? 0}
            r={5}
            fill="#f7f2e8"
            stroke={flow.amount > 0 ? BUY_COLOR : SELL_COLOR}
            strokeWidth={2.5}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
