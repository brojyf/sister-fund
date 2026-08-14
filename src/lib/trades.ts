/**
 * 账户曲线上的买卖打点。
 *
 * 纯展示用，不参与净值计算 —— 买卖本来就体现在账户总资产的涨跌里，
 * 再算一次就是重复计算。
 */
import type { AccountSnapshot } from './fund'

export interface Trade {
  /** YYYY-MM-DD */
  date: string
  action: 'BUY' | 'SELL'
  symbol: string
  units: number
  price: number
}

/** 一个打点：同一个快照日上的所有交易合成一个圆点 */
export interface TradeMarker {
  /** 快照日期，也就是圆点在 X 轴上的位置 */
  date: string
  /** 圆点画在账户曲线上，所以 y 取当天的账户总值 */
  totalValue: number
  trades: Trade[]
  /** 当天只有买、只有卖、还是两者都有 */
  side: 'buy' | 'sell' | 'both'
}

/**
 * 把交易对齐到快照日期。
 *
 * SnapTrade 的历史总资产是隔日粒度，交易日常常没有对应的快照；
 * Recharts 的分类轴只认数据里存在的 x 值，对不上的点会被静默丢弃。
 * 所以每笔交易挂到它当天或之后最近的一个快照上。
 */
export function buildTradeMarkers(
  trades: Trade[],
  snapshots: AccountSnapshot[],
): TradeMarker[] {
  if (snapshots.length === 0) return []

  const valueByDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot.totalValue]))
  const dates = snapshots.map((snapshot) => snapshot.date)
  const byDate = new Map<string, Trade[]>()

  for (const trade of trades) {
    const anchor = dates.find((date) => date >= trade.date)
    // 交易晚于最后一个快照（当天刚成交，快照还没同步）：等下次同步再画
    if (anchor === undefined) continue
    const bucket = byDate.get(anchor)
    if (bucket) bucket.push(trade)
    else byDate.set(anchor, [trade])
  }

  return [...byDate.entries()]
    .map(([date, dayTrades]) => ({
      date,
      totalValue: valueByDate.get(date) ?? 0,
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
