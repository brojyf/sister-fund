import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { axisTicks, formatChineseDate, formatMonthDay, money, tightDomain } from '../lib/format'

export interface EquityPoint {
  date: string
  equity: number
  floorEquity: number
}

interface Props {
  points: EquityPoint[]
}

/** 毛毛的持有金额，人民币。虚线是保底线 */
export function EquityChart({ points }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b4552e" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#b4552e" stopOpacity={0} />
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
          domain={tightDomain(points.flatMap((point) => [point.equity, point.floorEquity]))}
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
            const point = payload[0].payload as EquityPoint
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
      </ComposedChart>
    </ResponsiveContainer>
  )
}
