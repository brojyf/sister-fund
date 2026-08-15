/**
 * 账户快照历史的合并规则。
 *
 * 唯一的数据源是每天 sync 一次拿到的**实时总资产**。SnapTrade 的 balanceHistory
 * 已经弃用 —— 它不是 Robinhood 的日终收盘，是拿残缺活动列表倒推出来的估算，
 * 而且两笔零点时间戳的活动在 UTC/美东日界上摇摆，整条曲线骑着一个隔日翻转的
 * ±$51.16 伪影（成因见 README「为什么不用 balanceHistory」）。
 *
 * 所以合并只剩两条规则：已落盘的点不许被改写（否则手工核对过的真实值会被冲掉），
 * 当天那一格可以刷新（一天里跑第二次要拿到更新后的余额）。
 */

/**
 * @typedef {{ date: string, totalValue: number }} Snapshot
 * @param {Snapshot[]} recorded 仓库里已经落盘的快照
 * @param {Snapshot | null} live 当天的实时余额
 * @returns {Snapshot[]} 按日期升序
 */
export function mergeSnapshots(recorded, live) {
  const byDate = new Map(recorded.map((point) => [point.date, point]))
  if (live) byDate.set(live.date, live)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
