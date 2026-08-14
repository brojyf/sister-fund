import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AccountSnapshot } from '../lib/fund'
import { buildTradeMarkers, type Trade } from '../lib/trades'
import { axisTicks, formatChineseDate, formatMonthDay, tightDomain, usd } from '../lib/format'

const BUY_COLOR = '#4a6b4f'
const SELL_COLOR = '#a5442f'
const BOTH_COLOR = '#b4552e'

const MARKER_COLOR: Record<string, string> = {
  buy: BUY_COLOR,
  sell: SELL_COLOR,
  both: BOTH_COLOR,
}

interface Props {
  snapshots: AccountSnapshot[]
  trades: Trade[]
}

/** 托管账户的美元总资产走势，买卖打点画在曲线上 */
export function AccountChart({ snapshots, trades }: Props) {
  const markers = buildTradeMarkers(trades, snapshots)
  const markersByDate = new Map(markers.map((marker) => [marker.date, marker]))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={snapshots} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="accountFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6b6055" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#6b6055" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ddd2be" strokeDasharray="1 6" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={axisTicks(snapshots.map((snapshot) => snapshot.date))}
          tickFormatter={formatMonthDay}
          tick={{ fill: '#a99d8c', fontSize: 12, fontFamily: 'IBM Plex Mono' }}
          axisLine={{ stroke: '#ddd2be' }}
          tickLine={false}
        />
        <YAxis
          domain={tightDomain(snapshots.map((snapshot) => snapshot.totalValue))}
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
            const point = payload[0].payload as AccountSnapshot
            const marker = markersByDate.get(String(label))
            return (
              <div className="tip">
                <p className="tip__date">{formatChineseDate(String(label))}</p>
                <p className="tip__amount">{usd.format(point.totalValue)}</p>
                {marker?.trades.map((trade, index) => (
                  <p
                    key={`${trade.symbol}-${index}`}
                    className={trade.action === 'BUY' ? 'tip__buy' : 'tip__sell'}
                  >
                    {trade.action === 'BUY' ? '买入' : '卖出'} {trade.symbol}{' '}
                    {trade.units} × {usd.format(trade.price)}
                  </p>
                ))}
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="totalValue"
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
            y={marker.totalValue}
            r={4}
            fill={MARKER_COLOR[marker.side]}
            stroke="#f7f2e8"
            strokeWidth={2}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
