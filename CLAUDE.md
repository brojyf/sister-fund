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
**一律当成真实涨跌**。要剔掉自己的转账和 Gold 月费，就在 `account.json` 里把
那天的总资产写成扣掉这笔钱之后的值。别再引入第二套现金流 —— 它跟
`fundCashFlows`（基金层面，人民币，用来发份额算本金）单位和用途都不同，
混在一起测试不一定挂，但曲线会静默算错。

**两个口径不能混。** 托管账户图画的是**总资产 ÷ 固定本金 `ACCOUNT_BASE_CAPITAL`
（$2,000）**，是账户的绝对水位（`buildAccountReturnSeries`，只吃 `account.json`）；
毛毛的资产曲线是**逐日复利链 + 保底 + 抽成**（`buildFundSeries` 的 `realNav` /
`displayNav`），起点永远是 1。账户那条线上入金会显出台阶，这是刻意的，别
「顺手修好」——理由写在 `buildAccountReturnSeries` 的注释里。基数也别改回
「第一个快照」。

**别用 `getAccountBalanceHistory` 回填历史。** 它不是日终收盘，是 SnapTrade 拿
残缺活动列表倒推的估算，整条曲线骑着隔日翻转的 ±$51.16 时区伪影（成因和证据
在 `README.md` 的「为什么不用 balanceHistory」）。sync 只写当天一个点，历史手工填。

**快照日期一律走 `scripts/trading-day.mjs` 的 `newYorkDate()`。** 账户在美国，
`new Date().toISOString()` 拿的是 UTC 日期，美东 20:00 之后跑就错位一天。

**账户快照不保证连续。** 任何按「相邻两个快照」做的计算都必须用
`sumInWindow` 那种区间归集，不能假设资金变动一定落在快照日上。新写的
`describeCashFlows` 类逻辑同理，要处理流水日期不在快照日的情况。

**改 `account.json` 的历史值时，记得把自己的转账和月费扣掉。** 漏了不会让测试
挂，只会让那笔钱被静默算成毛毛的涨跌 —— `npm run verify` 的「当期涨跌」列会
冒出一个跟行情无关的大数，那是唯一的哨兵。

## 部署

`.github/workflows/deploy.yml` 是唯一部署入口：push 到 `main`、每天 23:00 UTC
或手动 `workflow_dispatch` 触发。**只有定时 run 会拉数据**：sync → test → build →
`wrangler deploy` → 把 `account.json` commit 回 `main`；push 和手动触发跳过
sync 与回写，只走 test → build → `wrangler deploy`，部署的是仓库里已有的
`account.json`。本地不要跑 `wrangler deploy`。定时 run 会自动产生
`chore: 同步账户快照 …` 提交，`git pull` 之后再动 `account.json`。

`.env.local`（gitignored）只有 `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY`，
CI 用同名 secrets；账户 ID 硬编码在 `scripts/config.mjs`，起始资金在
`src/lib/fundData.ts` 的 `ACCOUNT_BASE_CAPITAL`。
