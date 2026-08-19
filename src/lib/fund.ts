/**
 * 基金净值计算。
 *
 * 输入只有两样：账户每日总资产（美元，account.json）和毛毛的加钱/取钱
 * （人民币，cash-flows.json）。账户负责提供「涨跌幅」，你负责提供「本金」，
 * 两者相乘才是她看到的钱。
 *
 * **账户总资产的变动一律当成真实涨跌。** 券商层面没有单独的资金台账。
 *
 * 保底每天 0.01% 复利，超额部分抽成 50%，两者都以自然月为结算单位（锚点每月重置）。
 */

/** 每日保底收益率，按自然日复利。跌破由你补足（连着 30 天就是 0.30%） */
export const DAILY_FLOOR_RATE = 0.0001

/** 超过保底的部分，你抽走的比例 */
export const PERFORMANCE_FEE_RATE = 0.5

/** 某日账户总资产，来自 SnapTrade */
export interface AccountSnapshot {
  /** YYYY-MM-DD */
  date: string
  totalValue: number
}

/** 托管账户累计涨跌幅曲线上的一个点 */
export interface AccountReturnPoint {
  /** YYYY-MM-DD */
  date: string
  returnRate: number
  /**
   * 当天归到这个点上的基金流水合计（人民币，正数进负数出），没有就是 0。
   * 只是画在曲线上的标记，不参与涨跌幅计算 —— 这条线本来就不剔资金进出。
   */
  cashFlow: number
}

/**
 * 托管账户的涨跌幅：总资产 ÷ 起始资金 − 1。
 *
 * 基数是**固定的起始资金**（这个账户是 $2,000），不是第一个快照的值。用第一个
 * 快照当基准的话，只要那天的数值有偏差，整条曲线就整体平移；固定基数则是一句
 * 能对着 Robinhood App 心算验证的话：「本金 2000，现在 2132.98，涨 6.65%」。
 *
 * 这条线回答的是「账户里的钱比投进去的本金多了多少」，是账户的绝对水位；
 * 毛毛那条（buildFundSeries 的 displayNav）是逐日复利链，还叠了保底和抽成。
 * 两条线口径不同是刻意的。
 *
 * fundCashFlows 只用来在曲线上标出毛毛哪天加钱/取钱，不参与任何计算。
 * 流水日期不在快照日上时，归到之后第一个有快照的那天（同 describeCashFlows）；
 * 落在最后一个快照之后的流水没有点可挂，直接丢掉。
 */
export function buildAccountReturnSeries(
  snapshots: AccountSnapshot[],
  baseCapital: number,
  fundCashFlows: CashFlow[] = [],
): AccountReturnPoint[] {
  if (!(baseCapital > 0)) return []
  const points = [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, totalValue }) => ({
      date,
      returnRate: totalValue / baseCapital - 1,
      cashFlow: 0,
    }))

  for (const flow of fundCashFlows) {
    const point = points.find((candidate) => candidate.date >= flow.date)
    if (point) point.cashFlow += flow.amount
  }

  return points
}

/** 托管账户走势图标题旁的两个数字 */
export interface AccountReturnSummary {
  /** 最新快照日的累计涨跌幅：总资产 ÷ 起始资金 − 1 */
  totalReturnRate: number
  /** 最新快照日相对上一个快照日的涨跌幅，只有一个点时是 0 */
  dayChange: number
}

/**
 * 两个点的 returnRate 都是同一个固定本金除出来的，所以 (1+今日)/(1+昨日) − 1
 * 就等于总资产之比，不用把总资产再乘回去。
 */
export function summarizeAccountReturn(
  points: AccountReturnPoint[],
): AccountReturnSummary | null {
  const latest = points[points.length - 1]
  if (!latest) return null

  const previous = points[points.length - 2]
  const previousValue = previous ? 1 + previous.returnRate : 0
  const dayChange = previousValue > 0 ? (1 + latest.returnRate) / previousValue - 1 : 0

  return { totalReturnRate: latest.returnRate, dayChange }
}

/** 一笔资金变动。正数进，负数出 */
export interface CashFlow {
  /** YYYY-MM-DD */
  date: string
  amount: number
  /** 给人看的说明，不参与计算 */
  note?: string
}

export interface FundInput {
  snapshots: AccountSnapshot[]
  /** 毛毛基金的加钱/取钱 */
  fundCashFlows?: CashFlow[]
}

export interface FundPoint {
  date: string
  /** 账户的原始净值，不含保底也不含抽成 */
  realNav: number
  /** 本月原始表现直接兑现的话的净值，用来对比抽成拿走了多少 */
  grossNav: number
  /** 毛毛看到的净值：保底托底，超额部分抽成后 */
  displayNav: number
  /** 当日保底线 */
  floorNav: number
  /** 毛毛持有的份额 */
  units: number
  /** 毛毛看到的钱 = units × displayNav */
  equity: number
  /** 当日是否被保底托住了 */
  isFloored: boolean
  /** 累计被抽走的超额分成，折成钱 */
  feeAccrued: number
}

const MS_PER_DAY = 86_400_000

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function daysBetween(from: string, to: string): number {
  return (parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY
}

function monthKey(date: string): string {
  return date.slice(0, 7)
}

/**
 * 账户快照可能是隔日的（SnapTrade 的历史数据就是每 2 天一个点），
 * 所以资金变动要按「上一个快照之后、到这个快照为止」的区间归集，
 * 否则落在空档日的那笔钱会被漏掉，收益率就脏了。
 */
function sumInWindow(flows: CashFlow[], after: string | null, until: string): number {
  return flows
    .filter((flow) => flow.date <= until && (after === null || flow.date > after))
    .reduce((sum, flow) => sum + flow.amount, 0)
}

/**
 * 当月保底线锚点。每进入新的自然月，锚点重置为上月最后一天的展示净值，
 * 于是上个月已经兑现的收益（含被保底抬上去的部分）成为新的起跑线。
 */
interface MonthSegment {
  anchorDate: string
  anchorRealNav: number
  anchorDisplayNav: number
}

export function buildFundSeries({ snapshots, fundCashFlows = [] }: FundInput): FundPoint[] {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  if (ordered.length === 0) return []

  const points: FundPoint[] = []
  let realNav = 1
  let units = 0
  let feeAccrued = 0
  // 本月已计过抽成的超额比例，跨月清零（上个月的已经结算进锚点了）
  let feeCountedThisMonth = 0
  let segment: MonthSegment = {
    anchorDate: ordered[0].date,
    anchorRealNav: 1,
    anchorDisplayNav: 1,
  }

  for (let i = 0; i < ordered.length; i++) {
    const { date, totalValue } = ordered[i]
    const previousDate = i > 0 ? ordered[i - 1].date : null

    if (i > 0) {
      const previousValue = ordered[i - 1].totalValue
      // 账户总资产的变动全部当成真实涨跌，不剔任何券商层面的资金进出。
      const dailyReturn = previousValue > 0 ? totalValue / previousValue - 1 : 0
      realNav *= 1 + dailyReturn

      const previous = points[i - 1]
      if (monthKey(date) !== monthKey(previous.date)) {
        segment = {
          anchorDate: previous.date,
          anchorRealNav: previous.realNav,
          anchorDisplayNav: previous.displayNav,
        }
        feeCountedThisMonth = 0
      }
    }

    // 保底逐日累加，但**结算单位仍然是自然月**：锚点每月重置，所以上个月已兑现的
    // 收益不会被这个月吃掉，这个月的抽成也不会追溯上个月。保底线是从当月锚点起
    // 按天数复利长出来的，不是从开张那天一路长上来的。
    // 用自然日天数而不是快照个数：快照断了一天，那天的保底也照给。
    const realRatio = realNav / segment.anchorRealNav
    const floorRatio = (1 + DAILY_FLOOR_RATE) ** daysBetween(segment.anchorDate, date)

    // 跑赢保底的部分抽走一半；跑输就由保底线托住，不倒扣
    const excessRatio = Math.max(0, realRatio - floorRatio)
    const displayRatio = floorRatio + (1 - PERFORMANCE_FEE_RATE) * excessRatio

    const grossNav = segment.anchorDisplayNav * realRatio
    const floorNav = segment.anchorDisplayNav * floorRatio
    const displayNav = segment.anchorDisplayNav * displayRatio

    // 毛毛的钱按当日净值买份额，所以入金只增加等额的钱，不凭空产生收益
    // 抽成按当期新增的超额计，并且用「这期加钱之前」的份额 ——
    // 新入的钱是按已经扣过抽成的净值买的，不该再为之前的涨幅付一次钱。
    // 超额回落时增量为负，等于把没落袋的抽成退回去。
    const feeIncrement =
      units *
      segment.anchorDisplayNav *
      PERFORMANCE_FEE_RATE *
      (excessRatio - feeCountedThisMonth)
    feeAccrued += feeIncrement
    feeCountedThisMonth = excessRatio

    const fundFlow = sumInWindow(fundCashFlows, previousDate, date)
    if (fundFlow !== 0) units += fundFlow / displayNav

    points.push({
      date,
      realNav,
      grossNav,
      displayNav,
      floorNav,
      units,
      equity: units * displayNav,
      isFloored: realRatio < floorRatio,
      feeAccrued,
    })
  }

  return points
}

/** 一笔基金流水，附上它到今天为止赚了多少 */
export interface CashFlowRecord extends CashFlow {
  /**
   * 这笔钱从进来那天到最新一天赚了多少。
   * 取钱是把钱拿走，没有「到今天赚了多少」可言，记 null。
   */
  gain: number | null
  /** 这笔钱的累计收益率，口径同上 */
  returnRate: number | null
}

/**
 * 把基金流水对齐到净值曲线上，算出每一笔到今天赚了多少。
 *
 * 每笔钱是按进来那天的净值买的份额，所以它自己的收益率就是
 * 「最新净值 ÷ 进来那天的净值 − 1」—— 后进来的钱只跟了一小段，
 * 收益率天然低于整体涨幅，这正是要分笔展示的原因。
 *
 * 流水日期如果不在快照日上，归到之后第一个有快照的那天。
 */
export function describeCashFlows(
  points: FundPoint[],
  fundCashFlows: CashFlow[],
): CashFlowRecord[] {
  const latest = points[points.length - 1]
  if (!latest) return []

  return fundCashFlows
    .map((flow) => {
      const point = points.find((candidate) => candidate.date >= flow.date)
      if (!point) return null
      const returnRate = flow.amount > 0 ? latest.displayNav / point.displayNav - 1 : null
      return {
        ...flow,
        returnRate,
        gain: returnRate === null ? null : flow.amount * returnRate,
      }
    })
    .filter((record): record is CashFlowRecord => record !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** 首页要显示的几个数字 */
export interface FundSummary {
  equity: number
  /** 累计净投入的本金 */
  principal: number
  totalGain: number
  /**
   * 累计赚的钱占本金的比例，与 totalGain 是同一件事的两种写法。
   * 不能用净值涨幅代替：净值是从第一天起算的，而后面加进来的钱只跟了一小段，
   * 拿 4.11% 去配 +¥41.15 的本金 1 万，会让人以为赚了 411 块。
   */
  totalReturnRate: number
  /** 当期收益，只算已有的钱涨了多少，不含新加进来的钱 */
  dayGain: number
  isFloored: boolean
  /** 累计被抽走的超额分成 */
  performanceFee: number
}

export function summarize(
  points: FundPoint[],
  fundCashFlows: CashFlow[] = [],
): FundSummary | null {
  if (points.length === 0) return null

  const latest = points[points.length - 1]
  const previous = points[points.length - 2]
  const principal = fundCashFlows
    .filter((flow) => flow.date <= latest.date)
    .reduce((sum, flow) => sum + flow.amount, 0)

  return {
    equity: latest.equity,
    principal,
    totalGain: latest.equity - principal,
    totalReturnRate: principal > 0 ? latest.equity / principal - 1 : 0,
    // 用上一期的份额乘净值涨幅，这样当期新加的钱不会被算成收益
    dayGain: previous ? previous.units * (latest.displayNav - previous.displayNav) : 0,
    isFloored: latest.isFloored,
    performanceFee: latest.feeAccrued,
  }
}
