# 毛毛基金

给毛毛看的每日资产曲线。收益率来自 Robinhood 账户（通过 SnapTrade 只读拉取），
本金和加钱/取钱由我手工记账，人民币计价。

## 规则

- **每月保底 0.3%**：跑输就由我补足，展示曲线不会下跌
- **超额分成 50%**：跑赢保底的部分，我拿走一半
- 保底和分成都以**自然月**为结算单位。锚点每月重置，所以上个月已兑现的收益
  不会被这个月吃掉，这个月的分成也不会追溯上个月

## 两套现金流，绝对不能混

这是整个项目最容易算错的地方。

| | 来源 | 用途 |
|---|---|---|
| `brokerAdjustments` | SnapTrade 活动记录里的 `CONTRIBUTION` / `WITHDRAWAL` / `FEE`，自动抓 | 把账户总资产还原成**干净的收益率** |
| `fundCashFlows` | `src/data/cash-flows.json`，**手写** | 给毛毛**发份额、算本金** |

账户里有我自己的钱进出（转账、Robinhood Gold 月费）。不剔除的话，
账户少 100 块会被算成一次亏损，毛毛的曲线就凭空掉一块。
反过来，毛毛的加钱是按当日净值买份额的，只增加等额的钱，不产生假收益。

**账户负责提供涨跌幅，我负责提供本金。**

## 命令

```bash
npm run dev               # 本地开发
npm test                  # 净值/保底/分成的单元测试
npm run verify            # 打印逐日对账表，人工核对
npm run snaptrade:sync    # 拉取账户数据 → src/data/account.json
npm run snaptrade:accounts # 列出已授权账户，确认 accountId
npm run snaptrade:connect  # 重新生成 Robinhood 授权链接（掉线时才用）
```

## 数据

- `src/data/account.json` — **脚本生成，别手改**。SnapTrade 返回的原始账户总资产、需要剔除的资金变动
- `src/data/cash-flows.json` — **手改这个**。毛毛的加钱/取钱

## 已知限制

- SnapTrade 的历史总资产是**隔日**粒度，且最多回溯 1 年。从今天起每天跑一次
  `snaptrade:sync` 才能积累出日粒度
- 账户 2026-07-15 之前是空的，算不出收益率。毛毛 6/26 就给钱了，
  这段空档在 `fundData.ts` 里补成「真实收益 0」，保底照给
- `getUserAccountReturnRates` 端点对这个账号未开通，收益率只能自己从总资产推
- **画不了 K 线**。账户历史每天只有一个 `total_value`，没有开高低收，
  蜡烛图缺三个数。账户走势图是折线，跟 Robinhood App 里那条一样

## 配置

`.env.local`（不进仓库）：

```
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
```

账户 ID 和起点在 `scripts/config.mjs`。
