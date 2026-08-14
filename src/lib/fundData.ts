import accountData from '../data/account.json'
import cashFlowData from '../data/cash-flows.json'
import type { AccountSnapshot, CashFlow } from './fund'

/**
 * 你个人的转账和费用，用来净化收益率。
 *
 * 只保留第一个真实快照之后的：在那之前账户是空的、快照是补齐出来的，
 * 拿一笔入金去除一个伪造的前值，只会算出一个假的暴跌。
 */
export const brokerAdjustments: CashFlow[] = accountData.brokerAdjustments.filter(
  (adjustment) => adjustment.date > accountData.snapshots[0].date,
)

/** 妹妹基金的加钱/取钱，手写在 src/data/cash-flows.json */
export const fundCashFlows: CashFlow[] = cashFlowData.flows

export const syncedAt: string = accountData.syncedAt

/**
 * 妹妹 6/26 就把钱给我了，但 Robinhood 账户 7/15 才有钱，中间这段没有收益率可算。
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

/** SnapTrade 返回的原始账户总资产，未做任何补齐，用于对账 */
export const rawSnapshots: AccountSnapshot[] = accountData.snapshots

/** 喂给净值计算的快照，起点对齐到妹妹第一次给钱那天 */
export const snapshots: AccountSnapshot[] = padToFirstDeposit(
  accountData.snapshots,
  fundCashFlows,
)
