/**
 * 生成 Robinhood 授权链接。
 *
 *   npm run snaptrade:connect
 *
 * 在浏览器打开输出的链接，登录 Robinhood 并授权只读访问。授权是长期有效的，
 * 这个脚本只在首次连接、或者连接掉了需要重连时才用得上。
 */
import { snaptrade } from './snaptrade-client.mjs'

const { data } = await snaptrade.authentication.loginSnapTradeUser({})

const url = data?.redirectURI
if (!url) {
  console.error('没拿到授权链接，原始返回：')
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log('\n在浏览器打开这个链接，登录 Robinhood 并授权只读访问：\n')
console.log(url)
console.log('\n授权完成后运行：npm run snaptrade:accounts')
