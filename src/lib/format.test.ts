import { describe, expect, it } from 'vitest'
import { axisTicks, formatShortDate, tightDomain } from './format'

describe('流水日期', () => {
  it('压成 yy/mm/dd，月日保留前导零', () => {
    expect(formatShortDate('2026-06-26')).toBe('26/06/26')
    expect(formatShortDate('2026-08-13')).toBe('26/08/13')
  })
})

describe('纵轴范围', () => {
  it('只包住数据，不从 0 起', () => {
    const [min, max] = tightDomain([10_000, 10_020, 10_041])

    expect(min).toBeGreaterThan(9_900)
    expect(max).toBeLessThan(10_100)
  })

  it('曲线全程持平时也不会塌成一条线', () => {
    const [min, max] = tightDomain([2_079.39, 2_079.39])

    expect(max).toBeGreaterThan(min)
  })

  it('没有数据时不炸', () => {
    expect(tightDomain([])).toEqual([0, 1])
  })
})

describe('横轴刻度', () => {
  it('跨三个月以上按月首日', () => {
    expect(axisTicks(['2026-06-26', '2026-06-28', '2026-07-01', '2026-08-01'])).toEqual([
      '2026-06-26',
      '2026-07-01',
      '2026-08-01',
    ])
  })

  it('不足三个月时均匀取点，不会只剩一两个刻度', () => {
    const days = Array.from(
      { length: 20 },
      (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`,
    )

    expect(axisTicks(days)).toHaveLength(5)
  })

  it('单点和空数组都不炸', () => {
    expect(axisTicks([])).toEqual([])
    expect(axisTicks(['2026-07-15'])).toEqual(['2026-07-15'])
  })
})
