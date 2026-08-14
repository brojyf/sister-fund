import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}，检查 .env.local`)
  return value
}

/**
 * Personal 档用 clientId + consumerKey 直连，不需要 registerUser，
 * 也不需要 userId/userSecret —— 那套是 Commercial 档（一个 App 服务多个用户）才要的。
 */
export const snaptrade = new Snaptrade({
  auth: SnaptradeAuth.personalApiKey({
    clientId: requireEnv('SNAPTRADE_CLIENT_ID'),
    consumerKey: requireEnv('SNAPTRADE_CONSUMER_KEY'),
  }),
})
