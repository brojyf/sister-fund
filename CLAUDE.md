# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 先看这个：上级目录的 CLAUDE.md 不适用于本仓库

`~/Downloads/CLAUDE.md` 和 `~/Downloads/AGENTS.md` 描述的是 cogate 平台（Go /
Rust / gRPC / Coolify），会被自动加载进上下文，但和本仓库**毫无关系**。本仓库是
`~/Downloads` 下一个独立的 Git 仓库，技术栈是 React + Vite + TypeScript，部署在
Cloudflare Workers 静态资源上。除了 `~/.claude/CLAUDE.md` 里的通用工作方式，
其余 cogate 约定（数据所有权、幂等三原则、队列、gRPC、迁移）一条都不要往这里套。

业务规则、口径解释和已知限制写在 `README.md`，本文件不重复，只讲代码怎么组织、
怎么跑、改动时会踩哪些坑。

## 命令

```bash
npm run dev            # Vite 开发服务器
npm test               # vitest run，CI 门槛
npm run build          # tsc -b && vite build，CI 门槛
npm run lint           # oxlint（CI 不跑，改完自觉跑）
npm run verify         # tsx 打印逐日对账表，人工核对净值/保底/抽成
npm run snaptrade:sync # 拉当天实时余额 → 追加进 src/data/account.json（需要 .env.local）
```

跑单个测试：`npx vitest run src/lib/fund.test.ts -t '保底'`（`-t` 匹配中文
`describe`/`it` 名）。

## 数据流

```
SnapTrade API（只拉「今天」的实时总资产）
   │ scripts/snaptrade-sync.mjs（每天 CI 跑一次）
   ▼
src/data/account.json             今天那一格脚本写；今天之前的手工填真实值
src/data/cash-flows.json          手写：毛毛的加钱/取钱（人民币）
   │ src/lib/fundData.ts  —— 唯一把两份 JSON 拼成计算输入的地方
   ▼
src/lib/fund.ts        —— 纯函数，无 IO，全部业务逻辑都在这里
   ▼
src/App.tsx + components/{EquityChart,AccountChart}.tsx  —— 只负责画
```

`fund.ts` 是纯函数模块，测试直接构造快照数组喂进去，不碰真实数据。
`fundData.ts` 是唯一的「真实数据入口」，所有补齐、过滤、拼装的 hack 都集中在
那里，`fund.ts` 里不许出现对具体日期的特判。

## 改动时最容易错的地方

**没有券商层面的资金台账了。** `adjustment.json` 已删除，账户总资产的变动
**一律当成真实涨跌**。别再引入第二套现金流 —— 它跟
`fundCashFlows`（基金层面，人民币，用来发份额算本金）单位和用途都不同，
混在一起测试不一定挂，但曲线会静默算错。

**`equity` 不等于任何一个 nav 乘份额。** 毛毛的钱是**按笔记账**的：
`buildFundSeries` 里每笔入金是一个 lot，锚点是它自己进来那天，跨月才重置，
`equity` / `floorEquity` 是把所有 lot 加总出来的。`displayNav` / `grossNav` /
`floorNav` 只是一条**参考净值**（「开张就放进去 1 块钱现在值多少」），给
`npm run verify` 和整体口径用，**不要**拿它乘份额去还原毛毛的钱 —— 高点进来
的那笔有自己更高的保底线，乘出来会偏低。逐笔明细在 `FundPoint.lots`，
`describeCashFlows` 就是从那里取数的。取钱按 FIFO 扣，见 `withdrawFifo`。

**两个口径不能混。** 托管账户图画的是**总资产 ÷ 固定本金 `ACCOUNT_BASE_CAPITAL`
（$2,000）**，是账户的绝对水位（`buildAccountReturnSeries`，只吃 `account.json`）；
毛毛的资产曲线是**逐笔复利链 + 保底 + 抽成**加总。账户那条线上入金会显出台阶，这是刻意的，别
「顺手修好」——理由写在 `buildAccountReturnSeries` 的注释里。基数也别改回
「第一个快照」。

**别用 `getAccountBalanceHistory` 回填历史。** 它不是日终收盘，是 SnapTrade 拿
残缺活动列表倒推的估算，整条曲线骑着隔日翻转的 ±$51.16 时区伪影（成因和证据
在 `README.md` 的「为什么不用 balanceHistory」）。sync 只写当天一个点，历史手工填。

**`account.json` 里只放开盘日。** 休市日余额不动，写进去只是重复点，
`snaptrade-sync.mjs` 开头用 `isMarketClosed()` 直接退出，cron 也收成 `1-5`。假日表
是 `scripts/trading-day.mjs` 里硬编码的 `MARKET_HOLIDAYS`，覆盖到 2027 年底，
**每年底照 nyse.com/markets/hours-calendars 续一年**；过期不会报错、只会漏判，
sync 会打一行 `⚠️ 假日表还没续`。续表时注意观察日：假日落在周六要提前到周五、
落在周日要顺延到周一，写错会被「假日表里全是工作日」那条测试拦下。删休市点是安全的：`realNav` 是相邻比值连乘（等值点比值为 1），
保底走 `daysBetween` 自然日而不是快照个数，删掉不改变任何保留日的数字。

**快照日期一律走 `scripts/trading-day.mjs` 的 `newYorkDate()`。** 账户在美国，
`new Date().toISOString()` 拿的是 UTC 日期，美东 20:00 之后跑就错位一天。

**账户快照不保证连续。** 任何按「相邻两个快照」做的计算都必须用
`sumInWindow` 那种区间归集，不能假设资金变动一定落在快照日上。新写的
`describeCashFlows` 类逻辑同理，要处理流水日期不在快照日的情况。

## 部署

`.github/workflows/deploy.yml` 是唯一部署入口：push 到 `main`、周一到周五
23:00 UTC 或手动 `workflow_dispatch` 触发。**只有定时 run 会拉数据**：sync → test → build →
`wrangler deploy` → 把 `account.json` commit 回 `main`；push 和手动触发跳过
sync 与回写，只走 test → build → `wrangler deploy`，部署的是仓库里已有的
`account.json`。本地不要跑 `wrangler deploy`。定时 run 会自动产生
`chore: 同步账户快照 …` 提交，`git pull` 之后再动 `account.json`。

`.env.local`（gitignored）只有 `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY`，
CI 用同名 secrets；账户 ID 硬编码在 `scripts/config.mjs`，起始资金在
`src/lib/fundData.ts` 的 `ACCOUNT_BASE_CAPITAL`。
