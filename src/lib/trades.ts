/**
 * 账户曲线上的买卖打点。
 *
 * 纯展示用，不参与净值计算 —— 买卖本来就体现在账户的涨跌里，
 * 再算一次就是重复计算。
 */
import type { AccountReturnPoint } from './fund'

export interface Trade {
  /** YYYY-MM-DD */
  date: string
  action: 'BUY' | 'SELL'
  symbol: string
  units: number
  price: number
}

/** 一个打点：同一天的所有交易合成一个圆点 */
export interface TradeMarker {
  /** 成交当天 */
  date: string
  trades: Trade[]
  /** 当天只有买、只有卖、还是两者都有 */
  side: 'buy' | 'sell' | 'both'
}

function toTime(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime()
}

/**
 * 把要打点的日期补进曲线。
 *
 * SnapTrade 的历史数据是隔日粒度，成交日和加钱取钱那天常常不在曲线上，而
 * Recharts 的分类轴只认数据里存在的 x 值 —— 不补进去，圆点要么被静默丢掉，
 * 要么只能挪到下一个快照日，那就不是「当天」了。
 *
 * 补出来的这天没有真实快照，收益率按前后两个快照线性插值；真实快照的值
 * 一个都不动，所以曲线的形状和端点不受影响。
 */
export function withMarkerDates(
  points: AccountReturnPoint[],
  dates: string[],
): AccountReturnPoint[] {
  if (points.length === 0) return points

  const first = points[0].date
  const last = points[points.length - 1].date
  const known = new Set(points.map((point) => point.date))

  const filled = [...new Set(dates)]
    .filter((date) => !known.has(date) && date > first && date < last)
    .map((date) => ({ date, returnRate: interpolate(points, date) }))

  if (filled.length === 0) return points
  return [...points, ...filled].sort((a, b) => a.date.localeCompare(b.date))
}

/** date 保证落在 points 的首末之间，所以一定能找到左右两个相邻点 */
function interpolate(points: AccountReturnPoint[], date: string): number {
  const next = points.findIndex((point) => point.date > date)
  const before = points[next - 1]
  const after = points[next]
  const ratio = (toTime(date) - toTime(before.date)) / (toTime(after.date) - toTime(before.date))
  return before.returnRate + (after.returnRate - before.returnRate) * ratio
}

/** 按成交日分组。曲线上没有的日期画不出来（比如晚于最后一个快照的当天成交） */
export function buildTradeMarkers(
  trades: Trade[],
  points: AccountReturnPoint[],
): TradeMarker[] {
  const known = new Set(points.map((point) => point.date))
  const byDate = new Map<string, Trade[]>()

  for (const trade of trades) {
    if (!known.has(trade.date)) continue
    const bucket = byDate.get(trade.date)
    if (bucket) bucket.push(trade)
    else byDate.set(trade.date, [trade])
  }

  return [...byDate.entries()]
    .map(([date, dayTrades]) => ({
      date,
      trades: dayTrades,
      side: tradeSide(dayTrades),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function tradeSide(trades: Trade[]): TradeMarker['side'] {
  const hasBuy = trades.some((trade) => trade.action === 'BUY')
  const hasSell = trades.some((trade) => trade.action === 'SELL')
  if (hasBuy && hasSell) return 'both'
  return hasBuy ? 'buy' : 'sell'
}
