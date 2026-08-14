import accountData from '../data/account.json'
import cashFlowData from '../data/cash-flows.json'
import type { AccountSnapshot, CashFlow } from './fund'
import type { Trade } from './trades'

/**
 * 你个人的转账和费用，用来净化收益率。
 *
 * 只保留第一个真实快照之后的：在那之前账户是空的、快照是补齐出来的，
 * 拿一笔入金去除一个伪造的前值，只会算出一个假的暴跌。
 */
export const brokerAdjustments: CashFlow[] = accountData.brokerAdjustments.filter(
  (adjustment) => adjustment.date > accountData.snapshots[0].date,
)

/** 毛毛基金的加钱/取钱，手写在 src/data/cash-flows.json */
export const fundCashFlows: CashFlow[] = cashFlowData.flows

export const syncedAt: string = accountData.syncedAt

/**
 * 买卖记录，只用来在账户曲线上打点。
 *
 * `trades` 是后加的字段，同步过一次之前 account.json 里没有它 ——
 * 缺字段时给空数组，页面照常渲染，只是没有打点。
 */
export const trades: Trade[] = (
  (accountData as Record<string, unknown>).trades as Trade[] | undefined
)?.filter((trade) => trade.action === 'BUY' || trade.action === 'SELL') ?? []

/**
 * 毛毛 6/26 就把钱给我了，但 Robinhood 账户 7/15 才有钱，中间这段没有收益率可算。
 * 补上几个持平的快照，让这段时间真实收益记为 0 —— 保底照给，不会因为账户
 * 还没开张就少给她几天。account.json 保持原样，只在这里拼装。
 */
function padToFirstDeposit(
  snapshots: AccountSnapshot[],
  flows: CashFlow[],
): AccountSnapshot[] {
  if (snapshots.length === 0 || flows.length === 0) return snapshots

  const firstDeposit = flows.map((flow) => flow.date).sort()[0]
  const firstSnapshot = snapshots[0]
  if (firstDeposit >= firstSnapshot.date) return snapshots

  const padded: AccountSnapshot[] = []
  const cursor = new Date(`${firstDeposit}T00:00:00Z`)
  const until = new Date(`${firstSnapshot.date}T00:00:00Z`)
  while (cursor < until) {
    padded.push({
      date: cursor.toISOString().slice(0, 10),
      totalValue: firstSnapshot.totalValue,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 2)
  }
  return [...padded, ...snapshots]
}

/**
 * 把毛毛加钱/取钱的日期补进快照。
 *
 * 账户快照是隔日的，8/13 给的钱本来要等 8/14 那个快照才发份额，圆点也只能
 * 画在 8/14 —— 不是她实际给钱那天。补一个当天的快照，份额和圆点都落回当天。
 *
 * 补出来这天没有行情，账户价值按上一个快照带过来，再加上当天的券商资金进出
 * （转账、月费）。这两笔在收益率里本来就要被剔除，带上它们这天的收益率正好
 * 是 0，也不会把那笔钱的进出错算到下一个快照的涨跌里。
 */
function withCashFlowDates(
  snapshots: AccountSnapshot[],
  flows: CashFlow[],
  adjustments: CashFlow[],
): AccountSnapshot[] {
  if (snapshots.length === 0) return snapshots

  const realValueByDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot.totalValue]))
  const first = snapshots[0].date
  const last = snapshots[snapshots.length - 1].date
  const missing = flows
    .map((flow) => flow.date)
    .filter((date) => !realValueByDate.has(date) && date > first && date < last)

  if (missing.length === 0) return snapshots

  let carried = snapshots[0].totalValue
  return [...new Set([...realValueByDate.keys(), ...missing])].sort().map((date) => {
    const real = realValueByDate.get(date)
    carried = real ?? carried + sumOn(adjustments, date)
    return { date, totalValue: carried }
  })
}

function sumOn(flows: CashFlow[], date: string): number {
  return flows
    .filter((flow) => flow.date === date)
    .reduce((sum, flow) => sum + flow.amount, 0)
}

/** SnapTrade 返回的原始账户总资产，未做任何补齐，用于账户走势图 */
export const rawSnapshots: AccountSnapshot[] = accountData.snapshots

/** 喂给净值计算的快照：起点对齐到毛毛第一次给钱那天，加钱取钱那天也补上 */
export const snapshots: AccountSnapshot[] = withCashFlowDates(
  padToFirstDeposit(accountData.snapshots, fundCashFlows),
  fundCashFlows,
  brokerAdjustments,
)
