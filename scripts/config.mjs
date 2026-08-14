/** 毛毛基金的 Robinhood 账户。账户列表见 npm run snaptrade:accounts */
export const ACCOUNT_ID =
  process.env.SNAPTRADE_ACCOUNT_ID ?? '3a21527b-b6f7-4d9f-beca-c2e058fa7934'

/** 基金起点。账户在这天之前总资产是 0，算不出收益率 */
export const INCEPTION = '2026-07-15'

/**
 * 这些活动类型是资金搬运或成本，不是投资盈亏，要从收益率里剔除：
 *   CONTRIBUTION / WITHDRAWAL —— 你个人往账户里转进转出
 *   FEE                       —— Robinhood Gold 月费，算你的成本
 * 其余类型（BUY / SELL / INTEREST / DIVIDEND / OPTION* 等）都是真实盈亏，保留。
 */
export const NEUTRALIZED_ACTIVITY_TYPES = new Set(['CONTRIBUTION', 'WITHDRAWAL', 'FEE'])

/** 已知属于真实盈亏的类型。不在这两个集合里的类型会被告警，避免静默算错 */
export const KNOWN_PNL_ACTIVITY_TYPES = new Set([
  'BUY',
  'SELL',
  'DIVIDEND',
  'INTEREST',
  'OPTIONASSIGNMENT',
  'OPTIONEXPIRATION',
  'OPTIONEXERCISE',
  'STOCK_DIVIDEND',
])
