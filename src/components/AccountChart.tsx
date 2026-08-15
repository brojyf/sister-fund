import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AccountReturnPoint } from '../lib/fund'
import {
  axisTicks,
  formatChineseDate,
  formatMonthDay,
  percent,
  signedMoney,
  tightDomain,
} from '../lib/format'

interface Props {
  points: AccountReturnPoint[]
}

const FLOW_IN_COLOR = '#4a6b4f'
const FLOW_OUT_COLOR = '#a5442f'

interface FlowDotProps {
  cx?: number
  cy?: number
  payload?: AccountReturnPoint
}

/**
 * 有流水的那天在曲线上点一个实心圆：买入绿、卖出红。
 * 用 Area 的 dot 回调而不是 ReferenceDot，位置直接跟着曲线的比例尺走。
 */
function FlowDot({ cx, cy, payload }: FlowDotProps) {
  if (cx === undefined || cy === undefined || !payload?.cashFlow) return <g />
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.cashFlow > 0 ? FLOW_IN_COLOR : FLOW_OUT_COLOR}
      stroke="#f7f2e8"
      strokeWidth={1.5}
    />
  )
}

/** 托管账户的累计收益率走势 */
export function AccountChart({ points }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
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
            return (
              <div className="tip">
                <p className="tip__date">{formatChineseDate(String(label))}</p>
                <p className="tip__amount">{percent.format(point.returnRate)}</p>
                {point.cashFlow !== 0 && (
                  <p className={point.cashFlow > 0 ? 'tip__flow--in' : 'tip__flow--out'}>
                    {point.cashFlow > 0 ? '买入' : '卖出'} {signedMoney.format(point.cashFlow)}
                  </p>
                )}
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
          dot={<FlowDot />}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
