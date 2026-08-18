import { describe, expect, it } from 'vitest'
import { MARKET_HOLIDAYS, isMarketClosed, newYorkDate } from './trading-day.mjs'

describe('快照日期按美东归档', () => {
  it('北京时间早上跑 sync，UTC 已经跳天，美东还在前一天', () => {
    // 北京 2026-08-16 08:30 = UTC 2026-08-16 00:30 = 美东 2026-08-15 20:30
    expect(newYorkDate(new Date('2026-08-16T00:30:00Z'))).toBe('2026-08-15')
  })

  it('CI 在 23:00 UTC 跑，美东还是同一天的收盘后', () => {
    expect(newYorkDate(new Date('2026-08-15T23:00:00Z'))).toBe('2026-08-15')
  })

  it('美东午夜之后才翻页', () => {
    expect(newYorkDate(new Date('2026-08-16T03:59:00Z'))).toBe('2026-08-15')
    expect(newYorkDate(new Date('2026-08-16T04:00:00Z'))).toBe('2026-08-16')
  })
})

describe('休市日不记快照', () => {
  it('周六周日休市', () => {
    expect(isMarketClosed('2026-08-15')).toBe(true)
    expect(isMarketClosed('2026-08-16')).toBe(true)
  })

  it('普通工作日开盘', () => {
    expect(isMarketClosed('2026-08-14')).toBe(false)
    expect(isMarketClosed('2026-08-17')).toBe(false)
  })

  it('工作日的假日也休市', () => {
    expect(isMarketClosed('2026-09-07')).toBe(true) // 劳动节
    expect(isMarketClosed('2026-11-26')).toBe(true) // 感恩节
  })

  it('假日落在周末时，休市的是挪过去的观察日', () => {
    // 2026-07-04 是周六，独立日提前到 7/3 收市
    expect(isMarketClosed('2026-07-03')).toBe(true)
    // 2027-07-04 是周日，独立日顺延到 7/5 收市，7/2 周五照常开盘
    expect(isMarketClosed('2027-07-02')).toBe(false)
    expect(isMarketClosed('2027-07-05')).toBe(true)
  })

  // 表里出现周末日期，说明观察日算错了 —— 续表时最容易犯的错
  it('假日表里全是工作日', () => {
    const weekendEntries = [...MARKET_HOLIDAYS].filter((date) => {
      const day = new Date(`${date}T00:00:00Z`).getUTCDay()
      return day === 0 || day === 6
    })
    expect(weekendEntries).toEqual([])
  })
})
