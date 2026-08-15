/**
 * 账户快照历史的合并规则。
 *
 * SnapTrade 的 balanceHistory 是「实验性、估算、隔日粒度」的端点，拿它当唯一
 * 数据源，曲线永远只有那十几个隔日点。日粒度得靠每天跑一次 sync、把当天的
 * 实时余额沉淀进仓库慢慢攒 —— 前提是不能把昨天攒下的点覆盖掉。
 */

/**
 * @typedef {{ date: string, totalValue: number }} Snapshot
 * @param {Snapshot[]} recorded 仓库里已经落盘的快照
 * @param {Snapshot[]} estimated balanceHistory 返回的估算值
 * @param {Snapshot | null} live 当天的实时余额
 * @returns {Snapshot[]} 按日期升序
 */
export function mergeSnapshots(recorded, estimated, live) {
  const byDate = new Map()
  // 估算值只用来补历史空档。已落盘的点不许被改写：否则昨天记下的真实余额
  // 会被今天返回的估算替掉，整条曲线每天回溯性地抖一下。
  for (const point of estimated) byDate.set(point.date, point)
  for (const point of recorded) byDate.set(point.date, point)
  // 当天是唯一可变的一格，一天里跑第二次要拿到更新后的余额。
  if (live) byDate.set(live.date, live)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
