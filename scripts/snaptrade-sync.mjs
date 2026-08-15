/**
 * 从 SnapTrade 拉取账户历史总资产，写入 src/data/account.json。
 *
 *   npm run snaptrade:sync
 *
 * 这个脚本只负责「账户涨跌幅」这一半。毛毛的本金和加钱/取钱在
 * src/data/cash-flows.json，那个是你手写的，脚本不碰。
 *
 * 账户里我个人的转账和月费也不归这个脚本管：SnapTrade 的活动列表漏掉失败又
 * 撤回的转账，所以那是一份手写的 src/data/adjustment.json。脚本不去拉活动
 * 列表 —— 拉回来也没人用，还会误导下一个人去合并它。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { snaptrade } from './snaptrade-client.mjs'
import { mergeSnapshots } from './snapshot-history.mjs'
import { ACCOUNT_ID, INCEPTION } from './config.mjs'

const OUTPUT = new URL('../src/data/account.json', import.meta.url)

const today = new Date().toISOString().slice(0, 10)

// ── 历史总资产 ─────────────────────────────────────────────
const recorded = existsSync(OUTPUT)
  ? (JSON.parse(readFileSync(OUTPUT, 'utf8')).snapshots ?? [])
  : []

const { data: history } = await snaptrade.accountInformation.getAccountBalanceHistory({
  accountId: ACCOUNT_ID,
})
const rawPoints = Array.isArray(history) ? history : (history?.history ?? [])

const estimated = rawPoints
  .map((point) => ({ date: point.date, totalValue: Number(point.total_value) }))
  .filter((point) => point.date >= INCEPTION && Number.isFinite(point.totalValue))

// 历史端点只到昨天，补一个今天的实时余额，让曲线走到当天
const { data: accounts } = await snaptrade.accountInformation.listUserAccounts({})
const account = accounts.find((candidate) => candidate.id === ACCOUNT_ID)
const liveValue = Number(account?.balance?.total?.amount)
const live = Number.isFinite(liveValue) ? { date: today, totalValue: liveValue } : null

const snapshots = mergeSnapshots(recorded, estimated, live)

if (snapshots.length === 0) {
  throw new Error(`${INCEPTION} 之后没有任何账户快照，检查 ACCOUNT_ID 和 INCEPTION`)
}

// ── 落盘 ───────────────────────────────────────────────────
mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true })
writeFileSync(
  OUTPUT,
  `${JSON.stringify({ syncedAt: today, accountId: ACCOUNT_ID, snapshots }, null, 2)}\n`,
)

console.log(
  `账户快照 ${snapshots.length} 个（本次新增 ${snapshots.length - recorded.length}）：` +
    `${snapshots[0].date} → ${snapshots[snapshots.length - 1].date}`,
)

console.log(`已写入 src/data/account.json`)
