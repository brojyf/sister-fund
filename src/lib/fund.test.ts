import { describe, expect, it } from 'vitest'
import {
  buildAccountReturnSeries,
  buildFundSeries,
  describeCashFlows,
  summarize,
  type AccountSnapshot,
  type CashFlow,
} from './fund'

/** 生成一段日账户价值序列，用固定日收益率推进 */
function ramp(
  startDate: string,
  days: number,
  startValue: number,
  dailyReturn: number,
  stepDays = 1,
): AccountSnapshot[] {
  const snapshots: AccountSnapshot[] = []
  const cursor = new Date(`${startDate}T00:00:00Z`)
  let value = startValue
  for (let i = 0; i < days; i++) {
    snapshots.push({ date: cursor.toISOString().slice(0, 10), totalValue: value })
    cursor.setUTCDate(cursor.getUTCDate() + stepDays)
    value *= 1 + dailyReturn
  }
  return snapshots
}

/** 毛毛在第一天投入 1 万 */
function seedFund(startDate: string): CashFlow[] {
  return [{ date: startDate, amount: 10_000 }]
}

describe('账户只提供涨跌幅', () => {
  it('账户规模与毛毛的本金无关，只贡献涨幅', () => {
    const snapshots = ramp('2026-01-01', 31, 5_000, 0.002)
    const points = buildFundSeries({
      snapshots,
      fundCashFlows: seedFund('2026-01-01'),
    })

    const last = points[points.length - 1]
    // 账户本身只有 5000，毛毛本金 10000，净值走的是账户涨幅
    const accountRatio = snapshots[snapshots.length - 1].totalValue / 5_000
    expect(last.realNav).toBeCloseTo(accountRatio, 8)
    expect(last.grossNav).toBeCloseTo(accountRatio, 8)
    expect(last.equity).toBeCloseTo(10_000 * last.displayNav, 6)
    expect(last.isFloored).toBe(false)
  })

  it('首日净值为 1，且不触发保底', () => {
    const points = buildFundSeries({
      snapshots: ramp('2026-01-01', 5, 5_000, 0.001),
      fundCashFlows: seedFund('2026-01-01'),
    })
    expect(points[0].displayNav).toBe(1)
    expect(points[0].isFloored).toBe(false)
    expect(points[0].equity).toBeCloseTo(10_000, 6)
  })
})

describe('账户总资产的变动一律当成真实涨跌', () => {
  it('总资产少了多少就算亏多少 —— 转账和月费要在 account.json 里手工扣掉', () => {
    const snapshots: AccountSnapshot[] = [
      { date: '2026-08-11', totalValue: 2_100 },
      { date: '2026-08-13', totalValue: 2_000 },
    ]
    const points = buildFundSeries({ snapshots, fundCashFlows: seedFund('2026-08-11') })

    expect(points[1].realNav).toBeCloseTo(2_000 / 2_100, 8)
  })

  it('手工扣干净之后，账户走平就只剩保底在推', () => {
    // 8-13 转出 50、月费 50，总资产写成扣掉这 100 之后的值
    const snapshots: AccountSnapshot[] = [
      { date: '2026-08-11', totalValue: 2_100 },
      { date: '2026-08-13', totalValue: 2_100 },
    ]
    const points = buildFundSeries({ snapshots, fundCashFlows: seedFund('2026-08-11') })

    expect(points[1].realNav).toBeCloseTo(1, 8)
    expect(points[1].isFloored).toBe(true)
  })

  it('利息和分红属于真实收益，如实算进涨幅', () => {
    const snapshots: AccountSnapshot[] = [
      { date: '2026-08-11', totalValue: 2_000 },
      { date: '2026-08-13', totalValue: 2_020 },
    ]
    const points = buildFundSeries({ snapshots, fundCashFlows: seedFund('2026-08-11') })

    expect(points[1].realNav).toBeCloseTo(1.01, 8)
  })
})

describe('保底线', () => {
  it('账户躺平不动时，按天数 × 0.01% 保底结算', () => {
    const points = buildFundSeries({
      snapshots: ramp('2026-01-01', 31, 5_000, 0),
      fundCashFlows: seedFund('2026-01-01'),
    })
    const last = points[points.length - 1]

    // 1-01 到 1-31，锚点在首日，走了 30 个自然日
    expect(last.displayNav).toBeCloseTo(1.0001 ** 30, 8)
    expect(last.realNav).toBeCloseTo(1, 8)
    expect(last.isFloored).toBe(true)
  })

  it('亏损时展示曲线贴着保底线，绝不下跌', () => {
    const points = buildFundSeries({
      snapshots: ramp('2026-01-01', 20, 5_000, -0.005),
      fundCashFlows: seedFund('2026-01-01'),
    })

    for (let i = 1; i < points.length; i++) {
      expect(points[i].equity).toBeGreaterThan(points[i - 1].equity)
    }
    expect(points[points.length - 1].realNav).toBeLessThan(1)
    expect(points[points.length - 1].isFloored).toBe(true)
  })

  it('实际收益跑赢保底时，保底让位给抽成后的净值', () => {
    const points = buildFundSeries({
      snapshots: ramp('2026-01-01', 31, 5_000, 0.001),
      fundCashFlows: seedFund('2026-01-01'),
    })
    const last = points[points.length - 1]
    expect(last.isFloored).toBe(false)
    // 展示净值落在保底线和原始表现之间
    expect(last.displayNav).toBeGreaterThan(last.floorNav)
    expect(last.displayNav).toBeLessThan(last.grossNav)
  })

  it('月中开户时保底只从开户那天起算，不补当月前半个月', () => {
    const points = buildFundSeries({
      snapshots: ramp('2026-01-16', 16, 5_000, 0),
      fundCashFlows: seedFund('2026-01-16'),
    })
    expect(points[points.length - 1].displayNav).toBeCloseTo(1.0001 ** 15, 8)
  })

  it('隔日快照下保底线仍按自然日推进', () => {
    // 7-15 到 7-31 共 16 天，快照隔日
    const points = buildFundSeries({
      snapshots: ramp('2026-07-15', 9, 2_000, 0, 2),
      fundCashFlows: seedFund('2026-07-15'),
    })
    const last = points[points.length - 1]
    expect(last.date).toBe('2026-07-31')
    expect(last.displayNav).toBeCloseTo(1.0001 ** 16, 8)
  })
})

describe('超额分成', () => {
  it('跑赢保底的部分只兑现一半', () => {
    // 1 月账户涨 10%，保底 30 天约 0.30%，超额部分抽走一半
    const january = ramp('2026-01-01', 31, 5_000, 0)
    january.forEach((snapshot, i) => {
      snapshot.totalValue = 5_000 * 1.1 ** (i / 30)
    })
    const points = buildFundSeries({
      snapshots: january,
      fundCashFlows: seedFund('2026-01-01'),
    })
    const last = points[points.length - 1]

    const floorRatio = 1.0001 ** 30
    expect(last.realNav).toBeCloseTo(1.1, 8)
    expect(last.displayNav).toBeCloseTo(floorRatio + 0.5 * (1.1 - floorRatio), 8)
  })

  it('跑输保底时不抽成，保底照给', () => {
    const points = buildFundSeries({
      snapshots: ramp('2026-01-01', 31, 5_000, -0.002),
      fundCashFlows: seedFund('2026-01-01'),
    })
    const last = points[points.length - 1]

    expect(last.isFloored).toBe(true)
    expect(last.displayNav).toBeCloseTo(1.0001 ** 30, 8)
    expect(last.feeAccrued).toBeCloseTo(0, 8)
  })

  it('抽成金额等于超额部分的一半', () => {
    const january = ramp('2026-01-01', 31, 5_000, 0)
    january.forEach((snapshot, i) => {
      snapshot.totalValue = 5_000 * 1.1 ** (i / 30)
    })
    const points = buildFundSeries({
      snapshots: january,
      fundCashFlows: seedFund('2026-01-01'),
    })
    const last = points[points.length - 1]

    expect(last.feeAccrued).toBeCloseTo(last.units * (last.grossNav - last.displayNav), 8)
    expect(last.grossNav - last.displayNav).toBeCloseTo(
      0.5 * (last.grossNav - last.floorNav),
      8,
    )
  })

  it('后进的钱不为之前的涨幅补交抽成', () => {
    const january = ramp('2026-01-01', 31, 5_000, 0)
    january.forEach((snapshot, i) => {
      snapshot.totalValue = 5_000 * 1.1 ** (i / 30)
    })

    const early = buildFundSeries({
      snapshots: january,
      fundCashFlows: [{ date: '2026-01-01', amount: 1_000 }],
    })
    const lateTopUp = buildFundSeries({
      snapshots: january,
      fundCashFlows: [
        { date: '2026-01-01', amount: 1_000 },
        { date: '2026-01-31', amount: 100_000 }, // 月末才进来的一大笔
      ],
    })

    // 那 10 万只在最后一天进来，抽成不该因此暴涨
    expect(lateTopUp[30].feeAccrued).toBeCloseTo(early[30].feeAccrued, 6)
  })

  it('亏损月不倒扣，也不产生负抽成', () => {
    // 1 月涨 10% 抽成，2 月大跌
    const january = ramp('2026-01-01', 31, 5_000, 0)
    january.forEach((snapshot, i) => {
      snapshot.totalValue = 5_000 * 1.1 ** (i / 30)
    })
    const february = ramp('2026-02-01', 28, january[30].totalValue, -0.004)
    const points = buildFundSeries({
      snapshots: [...january, ...february],
      fundCashFlows: seedFund('2026-01-01'),
    })

    const januaryClose = points[30]
    const februaryClose = points[points.length - 1]

    // 2 月贴保底线走，1 月抽的成不退回，但也不再增加
    expect(februaryClose.isFloored).toBe(true)
    expect(februaryClose.feeAccrued).toBeCloseTo(januaryClose.feeAccrued, 8)
    expect(februaryClose.displayNav).toBeCloseTo(januaryClose.displayNav * 1.0001 ** 28, 6)
  })
})

describe('跨月保底重置', () => {
  it('坏月份不侵蚀上个月已兑现的收益', () => {
    const january = ramp('2026-01-01', 31, 10_000, 0)
    january.forEach((snapshot, i) => {
      snapshot.totalValue = 10_000 * 1.1 ** (i / 30)
    })
    const february = ramp('2026-02-01', 28, january[30].totalValue, 0)
    const points = buildFundSeries({
      snapshots: [...january, ...february],
      fundCashFlows: seedFund('2026-01-01'),
    })

    const januaryClose = points[30]
    const februaryClose = points[points.length - 1]

    const januaryFloor = 1.0001 ** 30
    const januaryNav = januaryFloor + 0.5 * (1.1 - januaryFloor)
    expect(januaryClose.displayNav).toBeCloseTo(januaryNav, 6)
    expect(januaryClose.isFloored).toBe(false)
    // 2 月锚点是 1 月抽成后的净值，保底叠加在它之上
    expect(februaryClose.displayNav).toBeCloseTo(januaryNav * 1.0001 ** 28, 6)
    expect(februaryClose.isFloored).toBe(true)
  })

  it('被保底托过的月份，下个月的真实收益照常兑现', () => {
    const january = ramp('2026-01-01', 31, 10_000, 0)
    const february = ramp('2026-02-01', 28, 10_000, 0)
    february.forEach((snapshot, i) => {
      snapshot.totalValue = 10_000 * 1.05 ** (i / 27)
    })
    const points = buildFundSeries({
      snapshots: [...january, ...february],
      fundCashFlows: seedFund('2026-01-01'),
    })

    const januaryClose = points[30]
    const februaryClose = points[points.length - 1]

    expect(januaryClose.isFloored).toBe(true)
    // 2 月真实涨 5%，扣掉保底后的超额抽一半。
    // 锚点是 1 月 31 日，到 2 月 28 日走了 28 个自然日
    const februaryFloor = 1.0001 ** 28
    const februaryRatio = februaryFloor + 0.5 * (1.05 - februaryFloor)
    expect(februaryClose.displayNav).toBeCloseTo(
      januaryClose.displayNav * februaryRatio,
      6,
    )
    expect(februaryClose.isFloored).toBe(false)
  })
})

describe('基金流水', () => {
  const snapshots = ramp('2026-01-01', 10, 5_000, 0.004)

  it('加钱不产生假收益，只增加等额的钱', () => {
    const fundCashFlows: CashFlow[] = [
      { date: '2026-01-01', amount: 10_000 },
      { date: '2026-01-05', amount: 5_000 },
    ]
    const points = buildFundSeries({ snapshots, fundCashFlows })

    const before = points[3]
    const after = points[4]
    // 原有的钱按净值涨，新入的 5000 按当日净值买份额，只贡献 5000
    const navStep = after.displayNav / before.displayNav
    expect(after.equity).toBeCloseTo(before.equity * navStep + 5_000, 6)
  })

  it('加钱不影响净值', () => {
    const withFlow = buildFundSeries({
      snapshots,
      fundCashFlows: [
        { date: '2026-01-01', amount: 10_000 },
        { date: '2026-01-05', amount: 5_000 },
      ],
    })
    const withoutFlow = buildFundSeries({
      snapshots,
      fundCashFlows: seedFund('2026-01-01'),
    })

    expect(withFlow[9].displayNav).toBeCloseTo(withoutFlow[9].displayNav, 10)
  })

  it('取钱后 equity 相应减少', () => {
    const points = buildFundSeries({
      snapshots,
      fundCashFlows: [
        { date: '2026-01-01', amount: 10_000 },
        { date: '2026-01-05', amount: -4_000 },
      ],
    })

    const before = points[3]
    const after = points[4]
    const navStep = after.displayNav / before.displayNav
    expect(after.equity).toBeCloseTo(before.equity * navStep - 4_000, 6)
  })

  it('当期收益不把新加的钱算成赚的', () => {
    const fundCashFlows: CashFlow[] = [
      { date: '2026-01-01', amount: 1_000 },
      { date: '2026-01-10', amount: 90_000 }, // 最后一天加了 90 倍
    ]
    const points = buildFundSeries({ snapshots, fundCashFlows })
    const summary = summarize(points, fundCashFlows)!

    // 当期只有原来那 1000 在涨，收益应该是个位数，不是 9 万
    expect(summary.dayGain).toBeLessThan(100)
    expect(summary.dayGain).toBeGreaterThan(0)
  })

  it('累计收益率和累计赚的钱必须对得上，不能用净值涨幅冒充', () => {
    // 1000 跟满全程，9000 最后一天才进来：净值涨幅远高于她这笔钱的实际收益率
    const fundCashFlows: CashFlow[] = [
      { date: '2026-01-01', amount: 1_000 },
      { date: '2026-01-10', amount: 9_000 },
    ]
    const points = buildFundSeries({ snapshots, fundCashFlows })
    const summary = summarize(points, fundCashFlows)!

    expect(summary.totalReturnRate).toBeCloseTo(summary.totalGain / summary.principal, 10)
    expect(summary.totalReturnRate).toBeLessThan(points[9].displayNav - 1)
  })

  it('本金只统计基金流水，与账户规模无关', () => {
    const fundCashFlows: CashFlow[] = [
      { date: '2026-01-01', amount: 10_000 },
      { date: '2026-01-05', amount: 5_000 },
      { date: '2026-01-07', amount: -2_000 },
    ]
    const summary = summarize(buildFundSeries({ snapshots, fundCashFlows }), fundCashFlows)

    expect(summary?.principal).toBe(13_000)
  })

  it('流水日期不在快照日时，归到之后第一个快照日', () => {
    const sparse = ramp('2026-07-15', 5, 2_000, 0.001, 2)
    const fundCashFlows: CashFlow[] = [
      { date: '2026-07-15', amount: 10_000 },
      { date: '2026-07-18', amount: 3_000 }, // 空档日，快照在 7-17 和 7-19
    ]
    const points = buildFundSeries({ snapshots: sparse, fundCashFlows })
    const records = describeCashFlows(points, fundCashFlows)

    // 7-18 那笔按 7-19 的净值买入，收益率只从 7-19 起算
    const latestNav = points[points.length - 1].displayNav
    const boughtAt = points.find((point) => point.date === '2026-07-19')!.displayNav
    expect(records[0].date).toBe('2026-07-18')
    expect(records[0].returnRate).toBeCloseTo(latestNav / boughtAt - 1, 10)
    expect(records[0].gain).toBeCloseTo(3_000 * (latestNav / boughtAt - 1), 8)
  })

  it('每笔的收益率各算各的，后进来的钱不冒领之前的涨幅', () => {
    const rising = ramp('2026-01-01', 10, 5_000, 0.004)
    const fundCashFlows: CashFlow[] = [
      { date: '2026-01-01', amount: 1_000 },
      { date: '2026-01-09', amount: 1_000 }, // 只跟了最后一段
    ]
    const records = describeCashFlows(
      buildFundSeries({ snapshots: rising, fundCashFlows }),
      fundCashFlows,
    )

    const [late, early] = records // 倒序，最新的在前
    expect(late.returnRate!).toBeGreaterThan(0)
    expect(late.returnRate!).toBeLessThan(early.returnRate!)
    expect(late.gain!).toBeLessThan(early.gain!)
  })

  it('取钱没有「到今天赚了多少」，记 null', () => {
    const fundCashFlows: CashFlow[] = [
      { date: '2026-01-01', amount: 10_000 },
      { date: '2026-01-05', amount: -4_000 },
    ]
    const records = describeCashFlows(
      buildFundSeries({ snapshots, fundCashFlows }),
      fundCashFlows,
    )
    const withdrawal = records.find((record) => record.amount < 0)!

    expect(withdrawal.gain).toBeNull()
    expect(withdrawal.returnRate).toBeNull()
  })
})

describe('托管账户涨跌幅（不剔资金，固定本金为基数）', () => {
  it('基数是起始资金，不是第一个快照', () => {
    const snapshots: AccountSnapshot[] = [
      { date: '2026-08-12', totalValue: 2_100 },
      { date: '2026-08-14', totalValue: 2_200 },
    ]
    const points = buildAccountReturnSeries(snapshots, 2_000)

    // 第一个点就已经赚了 5%，不会被归零
    expect(points[0].returnRate).toBeCloseTo(0.05, 10)
    expect(points[1].returnRate).toBeCloseTo(0.1, 10)
  })

  it('入金也算进涨跌幅，这条线本来就不剔资金', () => {
    const snapshots: AccountSnapshot[] = [
      { date: '2026-08-12', totalValue: 2_000 },
      { date: '2026-08-14', totalValue: 2_500 }, // 全是入金，一分没赚
    ]
    const points = buildAccountReturnSeries(snapshots, 2_000)

    expect(points[1].returnRate).toBeCloseTo(0.25, 10)
  })

  it('每个快照日都出点，不会因为缺手写数据而停住', () => {
    const snapshots: AccountSnapshot[] = [
      { date: '2026-08-10', totalValue: 2_000 },
      { date: '2026-08-12', totalValue: 2_100 },
      { date: '2026-08-14', totalValue: 2_200 },
    ]
    const points = buildAccountReturnSeries(snapshots, 2_000)

    expect(points.map((point) => point.date)).toEqual([
      '2026-08-10',
      '2026-08-12',
      '2026-08-14',
    ])
  })

  it('快照乱序进来也按日期升序输出', () => {
    const shuffled: AccountSnapshot[] = [
      { date: '2026-08-14', totalValue: 2_200 },
      { date: '2026-08-10', totalValue: 2_000 },
    ]
    const points = buildAccountReturnSeries(shuffled, 2_000)

    expect(points.map((point) => point.date)).toEqual(['2026-08-10', '2026-08-14'])
    expect(points[1].returnRate).toBeCloseTo(0.1, 10)
  })

  it('没有快照就没有曲线', () => {
    expect(buildAccountReturnSeries([], 2_000)).toEqual([])
  })
})
