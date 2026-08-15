/**
 * 从 SnapTrade 拉取账户历史总资产和资金变动，写入 src/data/account.json。
 *
 *   npm run snaptrade:sync
 *
 * 这个脚本只负责「账户涨跌幅」这一半。毛毛的本金和加钱/取钱在
 * src/data/cash-flows.json，那个是你手写的，脚本不碰。
 *
 * account.json 每次都被整个覆写，所以补录不要写进去：SnapTrade 活动列表里
 * 没有的资金进出（失败又撤回的转账就是这样）手写在
 * src/data/broker-adjustments.json，脚本同样不碰那个文件。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { snaptrade } from './snaptrade-client.mjs'
import {
  ACCOUNT_ID,
  INCEPTION,
  KNOWN_PNL_ACTIVITY_TYPES,
  NEUTRALIZED_ACTIVITY_TYPES,
} from './config.mjs'

const OUTPUT = new URL('../src/data/account.json', import.meta.url)

const today = new Date().toISOString().slice(0, 10)

// ── 历史总资产 ─────────────────────────────────────────────
const { data: history } = await snaptrade.accountInformation.getAccountBalanceHistory({
  accountId: ACCOUNT_ID,
})
const rawPoints = Array.isArray(history) ? history : (history?.history ?? [])

const snapshots = rawPoints
  .map((point) => ({ date: point.date, totalValue: Number(point.total_value) }))
  .filter((point) => point.date >= INCEPTION && Number.isFinite(point.totalValue))
  .sort((a, b) => a.date.localeCompare(b.date))

if (snapshots.length === 0) {
  throw new Error(`${INCEPTION} 之后没有任何账户快照，检查 ACCOUNT_ID 和 INCEPTION`)
}

// 历史端点只到昨天，补一个今天的实时余额，让曲线走到当天
const { data: accounts } = await snaptrade.accountInformation.listUserAccounts({})
const account = accounts.find((candidate) => candidate.id === ACCOUNT_ID)
const liveValue = Number(account?.balance?.total?.amount)

if (Number.isFinite(liveValue) && snapshots[snapshots.length - 1].date < today) {
  snapshots.push({ date: today, totalValue: liveValue })
}

// ── 资金变动 ───────────────────────────────────────────────
const { data: activityPage } = await snaptrade.accountInformation.getAccountActivities({
  accountId: ACCOUNT_ID,
  startDate: INCEPTION,
  endDate: today,
})
const activities = activityPage?.data ?? activityPage ?? []

const unknownTypes = new Set()
const brokerAdjustments = []

for (const activity of activities) {
  const type = activity.type
  const date = (activity.trade_date ?? activity.settlement_date).slice(0, 10)

  if (NEUTRALIZED_ACTIVITY_TYPES.has(type)) {
    brokerAdjustments.push({
      date,
      amount: Number(activity.amount),
      note: `${type} ${activity.description ?? ''}`.trim(),
    })
    continue
  }

  if (!KNOWN_PNL_ACTIVITY_TYPES.has(type)) {
    unknownTypes.add(type)
  }
}

// ── 落盘 ───────────────────────────────────────────────────
mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true })
writeFileSync(
  OUTPUT,
  `${JSON.stringify({ syncedAt: today, accountId: ACCOUNT_ID, snapshots, brokerAdjustments }, null, 2)}\n`,
)

console.log(`账户快照 ${snapshots.length} 个：${snapshots[0].date} → ${snapshots[snapshots.length - 1].date}`)
console.log(`剔除的资金变动 ${brokerAdjustments.length} 笔，合计 ${brokerAdjustments.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}`)
for (const item of brokerAdjustments) {
  console.log(`  ${item.date}  ${String(item.amount).padStart(9)}  ${item.note.slice(0, 52)}`)
}
if (unknownTypes.size > 0) {
  console.warn(
    `\n⚠️ 出现未知活动类型 ${[...unknownTypes].join(', ')} —— ` +
      '它们目前被当作真实盈亏。如果其实是资金搬运，加进 config.mjs 的 NEUTRALIZED_ACTIVITY_TYPES。',
  )
}

console.log(`\n已写入 src/data/account.json`)
