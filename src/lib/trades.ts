/**
 * 账户曲线上的买卖打点。
 *
 * 纯展示用，不参与净值计算 —— 买卖本来就体现在账户的涨跌里，
 * 再算一次就是重复计算。
 */

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
  /** 曲线上的日期，也就是圆点在 X 轴上的位置 */
  date: string
  trades: Trade[]
  /** 当天只有买、只有卖、还是两者都有 */
  side: 'buy' | 'sell' | 'both'
}

/**
 * 把交易对齐到曲线上的日期。
 *
 * SnapTrade 的历史数据是隔日粒度，交易日常常没有对应的点；
 * Recharts 的分类轴只认数据里存在的 x 值，对不上的点会被静默丢弃。
 * 所以每笔交易挂到它当天或之后最近的一个点上。
 */
export function buildTradeMarkers(
  trades: Trade[],
  points: { date: string }[],
): TradeMarker[] {
  const dates = points.map((point) => point.date)
  const byDate = new Map<string, Trade[]>()

  for (const trade of trades) {
    const anchor = dates.find((date) => date >= trade.date)
    // 交易晚于最后一个点（当天刚成交，快照还没同步）：等下次同步再画
    if (anchor === undefined) continue
    const bucket = byDate.get(anchor)
    if (bucket) bucket.push(trade)
    else byDate.set(anchor, [trade])
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
