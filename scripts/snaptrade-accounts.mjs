/**
 * 列出已授权的账户，确认 accountId 和当前总资产。
 *
 *   npm run snaptrade:accounts
 *
 * 顺便探测 getAccountBalanceHistory（历史总资产）对这个账号开没开 ——
 * SnapTrade 把它标为 experimental、默认关闭、最多回溯 1 年。
 * 开了的话我们能一次性补出历史曲线，没开就只能从今天开始逐日采集。
 */
import { snaptrade } from './snaptrade-client.mjs'

const { data: accounts } = await snaptrade.accountInformation.listUserAccounts({})

if (!accounts?.length) {
  console.log('还没有已授权的账户。先跑 npm run snaptrade:connect 完成授权。')
  process.exit(0)
}

for (const account of accounts) {
  console.log('─'.repeat(64))
  console.log(`账户名     ${account.name ?? '(无名)'}`)
  console.log(`券商       ${account.institution_name ?? '?'}`)
  console.log(`accountId  ${account.id}`)
  console.log(
    `当前总资产 ${account.balance?.total?.amount} ${account.balance?.total?.currency ?? ''}`,
  )

  try {
    const { data: history } = await snaptrade.accountInformation.getAccountBalanceHistory({
      accountId: account.id,
    })
    const points = Array.isArray(history) ? history : (history?.history ?? [])
    console.log(`历史总资产 ✅ 可用，${points.length} 个数据点`)
    if (points.length) {
      console.log(`  最早 ${JSON.stringify(points[0])}`)
      console.log(`  最新 ${JSON.stringify(points[points.length - 1])}`)
    }
  } catch (error) {
    const detail = error?.responseBody ?? error?.message ?? String(error)
    console.log(`历史总资产 ❌ 不可用：${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
}
