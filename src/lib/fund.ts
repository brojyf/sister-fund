/**
 * 基金净值计算。
 *
 * 这里有两套完全独立的现金流，混在一起就全错了：
 *
 *   brokerAdjustments —— 你在 Robinhood 账户里的个人资金动作（转入转出、Gold 月费）。
 *                        只用来把账户总资产还原成干净的收益率。跟毛毛没关系。
 *   fundCashFlows     —— 毛毛基金的加钱/取钱，你说了算。只用来发份额、算本金。
 *
 * 账户负责提供「涨跌幅」，你负责提供「本金」。两者相乘才是她看到的钱。
 */

/** 每月保底收益率。跌破由你补足 */
export const MONTHLY_FLOOR_RATE = 0.003

/** 超过保底的部分，你抽走的比例 */
export const PERFORMANCE_FEE_RATE = 0.5

/** 某日账户总资产，来自 SnapTrade */
export interface AccountSnapshot {
  /** YYYY-MM-DD */
  date: string
  totalValue: number
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
  /** 券商账户层面的资金进出与费用，用来净化收益率 */
  brokerAdjustments?: CashFlow[]
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

function daysInMonth(date: string): number {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
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

export function buildFundSeries({
  snapshots,
  brokerAdjustments = [],
  fundCashFlows = [],
}: FundInput): FundPoint[] {
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
      const adjustment = sumInWindow(brokerAdjustments, previousDate, date)
      // 剔除你个人的转账和费用之后，剩下的才是真实涨跌
      const dailyReturn =
        previousValue > 0 ? (totalValue - adjustment) / previousValue - 1 : 0
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

    // 保底和抽成都以「本月」为结算单位：锚点每月重置，所以上个月已兑现的
    // 收益不会被这个月吃掉，这个月的抽成也不会追溯上个月。
    const realRatio = realNav / segment.anchorRealNav
    const progress = daysBetween(segment.anchorDate, date) / daysInMonth(date)
    const floorRatio = (1 + MONTHLY_FLOOR_RATE) ** progress

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

/** 一笔基金流水，附上成交当日的净值和买到的份额 */
export interface CashFlowRecord extends CashFlow {
  /** 成交当日净值 */
  nav: number
  /** 这笔钱增发（正）或赎回（负）的份额 */
  units: number
  /** 成交后她的总资产 */
  equityAfter: number
}

/**
 * 把基金流水对齐到净值曲线上。流水日期如果不在快照日上
 * （账户快照是隔日的），归到之后第一个有快照的那天。
 */
export function describeCashFlows(
  points: FundPoint[],
  fundCashFlows: CashFlow[],
): CashFlowRecord[] {
  return fundCashFlows
    .map((flow) => {
      const point = points.find((candidate) => candidate.date >= flow.date)
      if (!point) return null
      return {
        ...flow,
        nav: point.displayNav,
        units: flow.amount / point.displayNav,
        equityAfter: point.equity,
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
  /** 她这笔钱实际赚了多少的比例（受加钱时点影响） */
  totalReturnRate: number
  /** 基金本身的累计收益率，与曲线一致，不受加钱时点影响 */
  navReturnRate: number
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
    navReturnRate: latest.displayNav - 1,
    // 用上一期的份额乘净值涨幅，这样当期新加的钱不会被算成收益
    dayGain: previous ? previous.units * (latest.displayNav - previous.displayNav) : 0,
    isFloored: latest.isFloored,
    performanceFee: latest.feeAccrued,
  }
}
