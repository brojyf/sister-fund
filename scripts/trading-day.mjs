/**
 * 快照该记在哪一天。
 *
 * 账户在美国，收盘是美东 16:00。用 `new Date().toISOString()` 拿到的是 UTC 日期，
 * 美东 20:00 之后（北京时间早上八点之后跑 sync）UTC 就已经是第二天了，那天的
 * 余额会被记到还没开盘的日期上，隔日曲线整体错位一格。一律按美东日历日归档。
 */

const NEW_YORK = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })

/**
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD，美东当地日期
 */
export function newYorkDate(now = new Date()) {
  return NEW_YORK.format(now)
}

/**
 * NYSE 休市日，硬编码。观察日已经按规则挪好（周六的假日提前到周五，周日的顺延到
 * 周一），所以表里全是工作日。表用完了 `isMarketClosed` 不会报错，只会漏判，
 * 由 `coveredYears` 兜底提醒 —— 每年底照 nyse.com/markets/hours-calendars 续一年。
 */
export const MARKET_HOLIDAYS = new Set([
  // 2026：7/4 是周六，独立日提前到 7/3
  '2026-01-01', // 元旦
  '2026-01-19', // 马丁路德金日
  '2026-02-16', // 华盛顿诞辰
  '2026-04-03', // 耶稣受难日
  '2026-05-25', // 阵亡将士纪念日
  '2026-06-19', // 六月节
  '2026-07-03', // 独立日（观察日）
  '2026-09-07', // 劳动节
  '2026-11-26', // 感恩节
  '2026-12-25', // 圣诞节
  // 2027：6/19 和 12/25 是周六提前到周五，7/4 是周日顺延到周一
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26',
  '2027-05-31',
  '2027-06-18', // 六月节（观察日）
  '2027-07-05', // 独立日（观察日）
  '2027-09-06',
  '2027-11-25',
  '2027-12-24', // 圣诞节（观察日）
])

/** 假日表覆盖到哪几年，用来提醒续表 */
export const coveredYears = new Set([...MARKET_HOLIDAYS].map((date) => date.slice(0, 4)))

/**
 * 休市日不记快照 —— 余额跟上一个交易日一模一样，写进去只是重复点。
 *
 * @param {string} date YYYY-MM-DD，美东当地日期
 * @returns {boolean}
 */
export function isMarketClosed(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6 || MARKET_HOLIDAYS.has(date)
}
