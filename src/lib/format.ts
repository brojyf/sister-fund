/** 两张图和页面正文共用的格式化与坐标轴工具 */

/** 毛毛的钱记人民币 */
export const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
})

export const signedMoney = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
  signDisplay: 'always',
})

/** 托管账户是美元的 */
export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 2,
  signDisplay: 'always',
})

export function formatChineseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${year} 年 ${month} 月 ${day} 日`
}

export function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}/${day}`
}

/**
 * X 轴刻度随区间长度自适应：跨三个月以上按月首日，否则在整段里均匀取点。
 * 固定按月的话，基金刚起步时整张图只剩一两个刻度。
 */
export function axisTicks(dates: string[]): string[] {
  if (dates.length === 0) return []

  const monthStarts = dates.filter(
    (date, index) => index === 0 || date.slice(0, 7) !== dates[index - 1].slice(0, 7),
  )
  if (monthStarts.length >= 3) return monthStarts

  const wanted = Math.min(5, dates.length)
  const step = (dates.length - 1) / (wanted - 1 || 1)
  return Array.from({ length: wanted }, (_, index) => dates[Math.round(index * step)])
}

/**
 * 纵轴只包住数据本身，绝不从 0 起。
 * 从 0 起会把几个百分点的波动压成一条平线 —— 行情图看的就是那点波动。
 */
export function tightDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = max - min > 0 ? (max - min) * 0.12 : Math.abs(max) * 0.01 || 1
  return [min - padding, max + padding]
}
