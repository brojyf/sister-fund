import accountData from '../data/account.json'
import manualAdjustmentData from '../data/broker-adjustments.json'
import cashFlowData from '../data/cash-flows.json'
import type { AccountSnapshot, CashFlow } from './fund'

/**
 * 你个人的转账和费用，用来净化收益率。
 *
 * 同步来的（account.json）和手工补录的（broker-adjustments.json）合在一起：
 * 失败又撤回的转账在 SnapTrade 的活动列表里一条都不留，只看账户余额就是
 * 一根凭空的尖刺，收益率会把它当成真涨真跌。
 *
 * 只保留第一个真实快照之后的：在那之前账户是空的、快照是补齐出来的，
 * 拿一笔入金去除一个伪造的前值，只会算出一个假的暴跌。
 */
export const brokerAdjustments: CashFlow[] = [
  ...accountData.brokerAdjustments,
  ...manualAdjustmentData.adjustments,
].filter((adjustment) => adjustment.date > accountData.snapshots[0].date)

/**
 * 账户开张时投进去的本金，托管账户收益率的分母。
 *
 * 不能拿第一个快照当分母：那天账户已经是 2079.39，里面含了开张到 7/15 之间
 * 赚的钱，拿它当基准会把这段收益抹平成 0。
 */
export const accountInitialPrincipal: number = manualAdjustmentData.initialPrincipal

/** 毛毛基金的加钱/取钱，手写在 src/data/cash-flows.json */
export const fundCashFlows: CashFlow[] = cashFlowData.flows

export const syncedAt: string = accountData.syncedAt

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

/** SnapTrade 返回的原始账户总资产，未做任何补齐，用于账户走势图 */
export const rawSnapshots: AccountSnapshot[] = accountData.snapshots

/** 喂给净值计算的快照，起点对齐到毛毛第一次给钱那天 */
export const snapshots: AccountSnapshot[] = padToFirstDeposit(
  accountData.snapshots,
  fundCashFlows,
)
