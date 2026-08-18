import { describe, expect, it } from 'vitest'
import { isWeekend, newYorkDate } from './trading-day.mjs'

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

describe('周末不记快照', () => {
  it('周六周日是周末', () => {
    expect(isWeekend('2026-08-15')).toBe(true)
    expect(isWeekend('2026-08-16')).toBe(true)
  })

  it('周一到周五不是', () => {
    expect(isWeekend('2026-08-14')).toBe(false)
    expect(isWeekend('2026-08-17')).toBe(false)
  })
})
