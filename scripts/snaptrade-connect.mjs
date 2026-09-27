/**
 * 生成 Robinhood 授权链接。
 *
 *   npm run snaptrade:connect
 *
 * 在浏览器打开输出的链接，登录 Robinhood 并授权只读访问。授权**会过期**：券商给的
 * token 几周就失效（第一次连接撑了 37 天，2026-08-14 → 09-20），失效后连接被标成
 * disabled，余额停在掉线前的缓存值，sync 会直接报错提醒来这里重连。
 *
 * 有失效的连接时走 reconnect 模式修复原连接，而不是新建一个 —— 新建的连接下
 * 账户 ID 可能变，scripts/config.mjs 里硬编码的 ACCOUNT_ID 就对不上了。
 */
import { snaptrade } from './snaptrade-client.mjs'

const { data: connections } = await snaptrade.connections.listBrokerageAuthorizations({})
const disabled = connections.find((connection) => connection.disabled)

const { data } = await snaptrade.authentication.loginSnapTradeUser(
  disabled ? { reconnect: disabled.id } : {},
)

const url = data?.redirectURI
if (!url) {
  console.error('没拿到授权链接，原始返回：')
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

if (disabled) {
  console.log(`\n连接 ${disabled.id} 于 ${disabled.disabled_date} 失效，下面是修复它的链接。`)
} else if (connections.length) {
  console.log('\n⚠️  现有连接都正常，下面的链接会新建一个连接，确认这是你要的。')
}
console.log('\n在浏览器打开这个链接，登录 Robinhood 并授权只读访问：\n')
console.log(url)
console.log('\n授权完成后运行：npm run snaptrade:accounts')
