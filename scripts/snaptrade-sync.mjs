/**
 * 拉取账户当天的实时总资产，追加进 src/data/account.json。
 *
 *   npm run snaptrade:sync
 *
 * 只拉「今天」这一个点。历史不从 API 补 —— getAccountBalanceHistory 返回的是
 * SnapTrade 倒推的估算，不是 Robinhood 的日终收盘，成因和证据见 README
 * 「为什么不用 balanceHistory」。历史那段是手工核对后写进 account.json 的，
 * 这个脚本不会碰它。
 *
 * 毛毛的本金和加钱/取钱在 src/data/cash-flows.json，手写，脚本不碰。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { snaptrade } from './snaptrade-client.mjs'
import { mergeSnapshots } from './snapshot-history.mjs'
import { newYorkDate } from './trading-day.mjs'
import { ACCOUNT_ID } from './config.mjs'

const OUTPUT = new URL('../src/data/account.json', import.meta.url)

// 账户在美国，快照按美东日历日归档 —— 用 UTC 日期会把收盘后的余额记到第二天
const today = newYorkDate()

const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : {}
const recorded = previous.snapshots ?? []

const { data: accounts } = await snaptrade.accountInformation.listUserAccounts({})
const account = accounts.find((candidate) => candidate.id === ACCOUNT_ID)
const totalValue = Number(account?.balance?.total?.amount)

if (!Number.isFinite(totalValue)) {
  throw new Error(`账户 ${ACCOUNT_ID} 没有返回总资产，检查 ACCOUNT_ID 和授权是否掉线`)
}

const snapshots = mergeSnapshots(recorded, { date: today, totalValue })

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true })
writeFileSync(
  OUTPUT,
  `${JSON.stringify(
    { _comment: previous._comment, syncedAt: today, accountId: ACCOUNT_ID, snapshots },
    null,
    2,
  )}\n`,
)

console.log(
  `${today}（美东）总资产 ${totalValue.toFixed(2)}，` +
    `快照 ${snapshots.length} 个：${snapshots[0].date} → ${snapshots[snapshots.length - 1].date}`,
)
console.log('已写入 src/data/account.json')
