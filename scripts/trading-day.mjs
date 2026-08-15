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
