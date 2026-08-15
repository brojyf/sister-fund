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
npm run snaptrade:sync # 拉 SnapTrade → 覆写 src/data/account.json（需要 .env.local）
```

跑单个测试：`npx vitest run src/lib/fund.test.ts -t '保底'`（`-t` 匹配中文
`describe`/`it` 名）。

## 数据流

```
SnapTrade API
   │ scripts/snaptrade-sync.mjs（每天 CI 跑一次）
   ▼
src/data/account.json             脚本生成，整个覆写，别手改
src/data/adjustment.json          手写：托管账户里我个人的转账/月费（美元）
src/data/cash-flows.json          手写：毛毛的加钱/取钱（人民币）
   │ src/lib/fundData.ts  —— 唯一把三份 JSON 拼成计算输入的地方
   ▼
src/lib/fund.ts        —— 纯函数，无 IO，全部业务逻辑都在这里
   ▼
src/App.tsx + components/{EquityChart,AccountChart}.tsx  —— 只负责画
```

`fund.ts` 是纯函数模块，测试直接构造快照数组喂进去，不碰真实数据。
`fundData.ts` 是唯一的「真实数据入口」，所有补齐、过滤、拼装的 hack 都集中在
那里，`fund.ts` 里不许出现对具体日期的特判。

## 改动时最容易错的地方

**两套现金流不能混。** `brokerAdjustments`（券商层面，美元，用来净化收益率）
和 `fundCashFlows`（基金层面，人民币，用来发份额算本金）是完全独立的两条线，
详见 `README.md` 和 `fund.ts` 顶部注释。把其中一个传给另一个参数，测试不一定
挂，但曲线会静默算错。

**两个口径不能混。** 托管账户图画的是**不剔资金的涨跌幅**
（`buildAccountReturnSeries`，只吃 `account.json`），毛毛的资产曲线是**剔掉
资金进出的时间加权**（`buildFundSeries` 的 `realNav`/`displayNav`）。账户那条
线上入金会显出台阶，这是刻意的，别「顺手修好」——理由写在
`buildAccountReturnSeries` 的注释里。

**账户快照可能是隔日的。** 任何按「相邻两个快照」做的计算都必须用
`sumInWindow` 那种区间归集，不能假设资金变动一定落在快照日上。新写的
`describeCashFlows` 类逻辑同理，要处理流水日期不在快照日的情况。

**资金流水写 `adjustment.json`，不写 `account.json`。** 后者每次 sync 被整个
覆写。`adjustment.json` 写的是**当天的增量**（正进负出，美元），不是累计余额：
只修当天那一笔，之后的日子不受影响。漏写不会让测试挂，只会让那笔转账被静默
算成毛毛的涨跌，`npm run verify` 的「当期涨跌」列能看出来。JSON 里字段叫
`notes`，`fundData.ts` 对齐到 `CashFlow` 的 `note`。

## 部署

`.github/workflows/deploy.yml` 是唯一部署入口：push 到 `main` 或每天 23:00 UTC
触发，顺序是 sync → test → build → `wrangler deploy` → 把 `account.json`
commit 回 `main`。本地不要跑 `wrangler deploy`。定时 run 会自动产生
`chore: 同步账户快照 …` 提交，`git pull` 之后再动 `account.json`。

`.env.local`（gitignored）只有 `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY`，
CI 用同名 secrets；账户 ID 和起点日期硬编码在 `scripts/config.mjs`。
