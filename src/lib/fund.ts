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

/**
 * 一笔入金到某一天为止的状态。保底是**按笔**给的：每笔钱从自己进来那天起
 * 单独长一条保底线，所以在高点进来的钱不会因为整体回撤而显示成亏损。
 */
export interface LotSnapshot {
  /** 对应 fundCashFlows 里那笔入金的下标 */
  flowIndex: number
  /** 还留在基金里的本金，被取钱按比例扣减过 */
  principal: number
  /** 毛毛看到的这笔钱现在值多少 */
  value: number
}

export interface FundPoint {
  date: string
  /** 账户的原始净值，不含保底也不含抽成 */
  realNav: number
  /**
   * 以下三条是**参考净值**：假设开张第一天就放进去 1 块钱，它现在值多少。
   * 用来看整体口径和对账（npm run verify），**不是**毛毛的钱的算法 ——
   * 真正的钱按笔记账，equity ≠ 任何一个 nav 乘份额。
   */
  grossNav: number
  /** 参考净值：保底托底、超额抽成后 */
  displayNav: number
  /** 参考净值的当日保底线 */
  floorNav: number
  /** 毛毛看到的钱 = 每笔入金各自算完之后加总 */
  equity: number
  /** 每笔入金的保底价值加总，就是「你的资产」图上那条保底线 */
  floorEquity: number
  /** 不抽成的话毛毛会有多少，用来对比抽成拿走了多少 */
  grossEquity: number
  /** 当期收益：只算上一期就在场的钱涨了多少，不含这期新加的 */
  dayGain: number
  /** 逐笔明细，资金流水表按笔取数用 */
  lots: LotSnapshot[]
  /** 每一笔钱的真实表现都跑输了自己那条保底线，即首页那句「现在正在走保底」 */
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
function flowsInWindow(
  flows: CashFlow[],
  after: string | null,
  until: string,
): { flow: CashFlow; index: number }[] {
  return flows
    .map((flow, index) => ({ flow, index }))
    .filter(({ flow }) => flow.date <= until && (after === null || flow.date > after))
    .sort((a, b) => a.flow.date.localeCompare(b.flow.date))
}

/**
 * 保底锚点。每进入新的自然月，锚点重置为上月最后一天的值，于是上个月已经
 * 兑现的收益（含被保底抬上去的部分）成为新的起跑线。
 */
interface Anchor {
  date: string
  realNav: number
}

/** 一笔入金的完整记账状态。保底线从它自己进来那天起长，跨月才重置锚点 */
interface Lot extends LotSnapshot {
  anchorDate: string
  anchorRealNav: number
  /** 锚点日这笔钱值多少，当月所有比例都乘在它上面 */
  anchorValue: number
  floorValue: number
  grossValue: number
  /** 真实表现跑输了自己那条保底线，靠补足托着 */
  isFloored: boolean
  feeAccrued: number
  /** 本月已计过抽成的超额比例，跨月清零 */
  feeCountedThisMonth: number
}

/**
 * 取钱按 FIFO 从最早那笔入金开始扣，扣不够就往后顺延。
 * 本金和锚点价值按同比例缩，这样「剩下的钱」的保底线和收益率都不受影响。
 */
function withdrawFifo(lots: Lot[], amount: number): void {
  let remaining = amount
  for (const lot of lots) {
    if (remaining <= 0) break
    if (lot.value <= 0) continue

    const taken = Math.min(lot.value, remaining)
    const kept = 1 - taken / lot.value
    lot.principal *= kept
    lot.anchorValue *= kept
    lot.floorValue *= kept
    lot.grossValue *= kept
    lot.value -= taken
    remaining -= taken
  }
}

export function buildFundSeries({ snapshots, fundCashFlows = [] }: FundInput): FundPoint[] {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  if (ordered.length === 0) return []

  const points: FundPoint[] = []
  const lots: Lot[] = []
  let realNav = 1

  // 参考净值那条链：假设开张第一天就放进去 1 块钱。只用于展示和对账。
  let reference: Anchor = { date: ordered[0].date, realNav: 1 }
  let referenceDisplayNav = 1

  for (let i = 0; i < ordered.length; i++) {
    const { date, totalValue } = ordered[i]
    const previousDate = i > 0 ? ordered[i - 1].date : null
    const previous = i > 0 ? points[i - 1] : null

    if (previous) {
      const previousValue = ordered[i - 1].totalValue
      // 账户总资产的变动全部当成真实涨跌，不剔任何券商层面的资金进出。
      const dailyReturn = previousValue > 0 ? totalValue / previousValue - 1 : 0
      realNav *= 1 + dailyReturn

      if (monthKey(date) !== monthKey(previous.date)) {
        reference = { date: previous.date, realNav: previous.realNav }
        referenceDisplayNav = previous.displayNav
      }
    }

    // 保底逐日累加，但**结算单位是自然月**：锚点每月重置，所以上个月已兑现的
    // 收益不会被这个月吃掉，这个月的抽成也不会追溯上个月。
    // 用自然日天数而不是快照个数：快照断了一天，那天的保底也照给。
    const referenceRealRatio = realNav / reference.realNav
    const referenceFloorRatio = (1 + DAILY_FLOOR_RATE) ** daysBetween(reference.date, date)
    // 跑赢保底的部分抽走一半；跑输就由保底线托住，不倒扣
    const referenceExcess = Math.max(0, referenceRealRatio - referenceFloorRatio)

    const grossNav = referenceDisplayNav * referenceRealRatio
    const floorNav = referenceDisplayNav * referenceFloorRatio
    const displayNav =
      referenceDisplayNav * (referenceFloorRatio + (1 - PERFORMANCE_FEE_RATE) * referenceExcess)

    // 每笔钱各自推进一天：锚点是它自己进来那天，跨月才重置
    const valueBefore = lots.map((lot) => lot.value)
    for (const lot of lots) {
      if (previous && monthKey(date) !== monthKey(previous.date)) {
        lot.anchorDate = previous.date
        lot.anchorRealNav = previous.realNav
        lot.anchorValue = lot.value
        lot.feeCountedThisMonth = 0
      }

      const realRatio = realNav / lot.anchorRealNav
      const floorRatio = (1 + DAILY_FLOOR_RATE) ** daysBetween(lot.anchorDate, date)
      const excess = Math.max(0, realRatio - floorRatio)

      // 超额回落时增量为负，等于把没落袋的抽成退回去
      lot.feeAccrued +=
        lot.anchorValue * PERFORMANCE_FEE_RATE * (excess - lot.feeCountedThisMonth)
      lot.feeCountedThisMonth = excess

      lot.floorValue = lot.anchorValue * floorRatio
      lot.grossValue = lot.anchorValue * realRatio
      lot.value = lot.anchorValue * (floorRatio + (1 - PERFORMANCE_FEE_RATE) * excess)
      lot.isFloored = realRatio < floorRatio
    }
    const dayGain = lots.reduce((sum, lot, index) => sum + lot.value - valueBefore[index], 0)

    // 加钱开一笔新的、从今天起自己长保底；取钱按 FIFO 从最早那笔扣起
    for (const { flow, index } of flowsInWindow(fundCashFlows, previousDate, date)) {
      if (flow.amount > 0) {
        lots.push({
          flowIndex: index,
          principal: flow.amount,
          value: flow.amount,
          anchorDate: date,
          anchorRealNav: realNav,
          anchorValue: flow.amount,
          floorValue: flow.amount,
          grossValue: flow.amount,
          isFloored: false,
          feeAccrued: 0,
          feeCountedThisMonth: 0,
        })
      } else if (flow.amount < 0) {
        withdrawFifo(lots, -flow.amount)
      }
    }

    points.push({
      date,
      realNav,
      grossNav,
      displayNav,
      floorNav,
      equity: lots.reduce((sum, lot) => sum + lot.value, 0),
      floorEquity: lots.reduce((sum, lot) => sum + lot.floorValue, 0),
      grossEquity: lots.reduce((sum, lot) => sum + lot.grossValue, 0),
      dayGain,
      lots: lots.map(({ flowIndex, principal, value }) => ({ flowIndex, principal, value })),
      // 有一笔跑赢保底就不算走保底 —— 每笔都在靠补足托着才是
      isFloored: lots.length > 0 && lots.every((lot) => lot.isFloored),
      feeAccrued: lots.reduce((sum, lot) => sum + lot.feeAccrued, 0),
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
 * 直接读最新一天的逐笔明细：每笔钱有自己的保底线，所以它的收益率是
 * 「这笔现在值多少 ÷ 还剩多少本金 − 1」，不是拿整体净值相除。后进来的钱
 * 只跟了一小段，收益率天然低于整体涨幅，这正是要分笔展示的原因。
 *
 * 流水日期如果不在快照日上，归到之后第一个有快照的那天。
 */
export function describeCashFlows(
  points: FundPoint[],
  fundCashFlows: CashFlow[],
): CashFlowRecord[] {
  const latest = points[points.length - 1]
  if (!latest) return []

  const lotByFlow = new Map(latest.lots.map((lot) => [lot.flowIndex, lot]))

  return fundCashFlows
    .map((flow, index): CashFlowRecord | null => {
      // 取钱是把钱拿走，没有「到今天赚了多少」可言
      if (flow.amount <= 0) {
        const point = points.find((candidate) => candidate.date >= flow.date)
        return point ? { ...flow, returnRate: null, gain: null } : null
      }

      // 落在最后一个快照之后的入金没有点可挂，也就没开出这一笔
      const lot = lotByFlow.get(index)
      if (!lot) return null

      const gain = lot.value - lot.principal
      return { ...flow, returnRate: lot.principal > 0 ? gain / lot.principal : 0, gain }
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
  const principal = fundCashFlows
    .filter((flow) => flow.date <= latest.date)
    .reduce((sum, flow) => sum + flow.amount, 0)

  return {
    equity: latest.equity,
    principal,
    totalGain: latest.equity - principal,
    totalReturnRate: principal > 0 ? latest.equity / principal - 1 : 0,
    // 逐笔算出来的当期收益，当期新加的钱不参与
    dayGain: latest.dayGain,
    isFloored: latest.isFloored,
    performanceFee: latest.feeAccrued,
  }
}
