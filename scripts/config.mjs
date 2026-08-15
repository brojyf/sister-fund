/** 毛毛基金的 Robinhood 账户。账户列表见 npm run snaptrade:accounts */
export const ACCOUNT_ID =
  process.env.SNAPTRADE_ACCOUNT_ID ?? '3a21527b-b6f7-4d9f-beca-c2e058fa7934'

/** 基金起点。账户在这天之前总资产是 0，算不出收益率 */
export const INCEPTION = '2026-07-15'
