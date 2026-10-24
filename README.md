# Maomao Fund

A real-money fund I run for my younger sister. The point is not the money — it is
to let her watch her own capital compound, dip and recover _every single day_,
so that investing stops being an abstract word and becomes a number she checks
with her morning coffee. She buys shares of an account I already own; her
purchase money goes to me and never enters the brokerage account. I keep the
books by hand in CNY at a fixed exchange rate and ignore FX gains and losses.
The app is in Chinese, because she reads Chinese.

Two rules make it safe enough to be a teaching tool:

- **A guaranteed floor of 0.01% per calendar day, compounded — roughly +3.72% a
  year** (about +0.30% a month). If the account underperforms, I top her up.
- **A 50% performance fee** on whatever beats that floor. That is the part meant
  to teach her the real cost of active management.

Everything below is how those rules are implemented.

## Rules

- **Floor: 0.01% per day**: compounded on calendar days, ~0.30% per 30 days and
  ~3.72% per 365 days. I cover any shortfall.
- **50% performance fee**: on the part above the floor, I take half.
- **The floor is granted per lot**: every deposit grows its own floor line from
  **the day it arrived**, so money that came in at a high point does not show up
  as a settled loss just because the whole account pulled back. In the cash-flow
  table the settled return rate is always ≥ 0, while the raw share return can be
  negative.
- The floor line grows **daily**, but **settlement is still per calendar month**:
  the anchor resets every month, so last month's realised gains cannot be eaten
  by this month, and this month's fee does not reach back into last month.

The guarantee is that **no lot falls below its own floor line**, not that "the
curve never goes down". If a lot climbs high and then retraces, it still falls as
long as it stays above its own floor — a negative "today" number on the home page
is normal.

## Two hand-maintained data files

| File | Unit | Purpose |
|---|---|---|
| `src/data/account.json` | USD | Daily total account value. Today's cell is written by the sync script; every earlier cell is **typed in by hand** |
| `src/data/cash-flows.json` | CNY | What my sister paid when buying / selling back shares I already owned — not account deposits or withdrawals |

**The account supplies the return; I supply the principal.**

## Raw share return vs settled return

The account's raw NAV is normalised to **1** on the first snapshot. Each purchase
buys `amount ÷ raw NAV on the purchase date` shares transferred out of my own
holdings, so the total share count never changes. The books are kept at a fixed
exchange rate, so no FX data is needed; these shares are not meant to represent
her real ownership percentage of the USD account. Moves from before the purchase
do not count toward that lot's return.

- **Raw market value**: `remaining shares × current raw NAV`.
- **Raw P&L / return rate**: `raw market value − remaining cost` / `raw P&L ÷
  remaining cost`. Across lots it is weighted by remaining cost, never an average
  of per-lot percentages.
- **Settled amount / return rate**: still governed by the original deal — per-lot
  floor, 50% fee above it, monthly settlement. The month-end result becomes next
  month's anchor but does not reset the raw shares, purchase NAV or cost.

Example: buying ¥1,100 when the NAV is 1.10 gives 1,000 shares; at 1.21 the raw
value is ¥1,210, a 10% raw return. The settled result is computed separately from
that lot's floor and fee rules. The gap between raw value and settled amount is
not "cumulative fees taken", because it also contains floor top-ups and past
monthly settlements.

If a purchase date has no snapshot, the existing alignment rule applies: it is
assigned to the first snapshot after it. Purchases after the last snapshot are
not counted yet. Both current purchases have a snapshot on their own date; legacy
placeholder assets are still computed by the existing record, and the formula
does not turn a placeholder into a verified valuation.

## Two measurement bases that must not be mixed

| Chart | Basis | Why |
|---|---|---|
| Custodial account | **Return**: total value ÷ **fixed capital of $2,000** − 1, flows not removed | Reads only `account.json`, so it can be checked against the app in one mental step |
| My sister's equity | **Per-lot bookkeeping**: each lot's own compounding chain + floor + fee, then summed | Her money came in several times, and each lot's floor starts on a different day |

The custodial account's base is the **initial capital of $2,000** (the three
opening ACH transfers of $10 + $1,490 + $500), stored as `ACCOUNT_BASE_CAPITAL` in
`src/lib/fundData.ts`. It deliberately does not use the first snapshot as the
base — one bad value there would shift the whole curve.

This line answers "how much more is in the account than the principal put in",
i.e. the account's absolute water level. Deposit days show a step that looks like
a spike; that is the basis doing its job, not a bug.

## Cash-flow table

The bottom of the page lists every purchase, remaining shares, purchase NAV, and
both raw and settled P&L / return rate. Narrow screens scroll horizontally to see
every column. Each lot keeps its own books: it grows its own floor line and pays
its own fee from the day it arrived, and its return rate is "what this lot is
worth now ÷ what is left of its principal − 1". Later money has only been in for a
short stretch, so its rate is naturally lower than the overall gain — per-lot
columns are what keep that from looking like an error.

The return columns on a withdrawal row show "—": the money is gone, so there is
no "gain so far". Withdrawals are matched **FIFO** from the earliest lot onward;
a partially withdrawn lot has its remaining principal, shares and floor line
scaled down proportionally, so the remaining part's return rate is unchanged.
Buy-backs reduce the original settled value; the raw P&L column reflects only
what is still held and excludes realised gains on sold shares.

## Why not balanceHistory

`getAccountBalanceHistory` is **not** Robinhood's end-of-day close. It is an
estimate SnapTrade back-derives from the activity list starting at the current
balance (it is marked experimental, ignores `startDate` / `endDate`, and always
returns 366 days). The whole returned history rides a **±$51.16 artefact that
flips every other day**. Measured:

| | Friday | Saturday | Sunday |
|---|---|---|---|
| 7/17–19 | 2079.36 | **2130.52** | 2079.36 |
| 8/7–9 | 2213.98 | **2162.82** | 2213.98 |

The market was closed, Friday and Sunday match to the cent, yet Saturday in
between is off by ±51.16.

The cause is **time zones**: rebuilding "current cash − all later activity" makes
the pure-cash segment alternate strictly between `+1.16 / −50.00` — exactly the
only two records in the activity list that carry **a date but no time**
(interest `2026-08-14T00:00:00Z`, Gold monthly fee `2026-08-13T00:00:00Z`). UTC
midnight is 20:00 the previous day in New York, so those two entries flip between
being counted and dropped at the day boundary, and the offset propagates all the
way back to the earliest day. Grouped by New York days, 8/12 and 8/13 come out to
the cent.

That is why the history in `account.json` is **typed in by hand against the
Robinhood app**; do not backfill it from this endpoint.

## Commands

```bash
npm run dev                # local dev server
npm test                   # unit tests for NAV / floor / fee
npm run verify             # print a day-by-day reconciliation table
npm run snaptrade:sync     # fetch today's live balance → append to src/data/account.json
npm run snaptrade:accounts # list connected accounts, confirm accountId
npm run snaptrade:connect  # regenerate the Robinhood authorisation link (only after it drops)
```

## Data

- `src/data/account.json` — total account value in USD. **Today's cell is
  written by sync; earlier cells are edited by hand** against the Robinhood app.
  The `2000` values from 2026-07-15 on are placeholders.
- `src/data/cash-flows.json` — **edit this by hand**. My sister's deposits and
  withdrawals, in CNY.

## Known limitations

- **History can only be filled in by hand.** The only usable history endpoint on
  SnapTrade is broken (see above), so apart from the daily snapshot that sync
  accumulates, every day has to be typed in from the app.
- The account was empty before 2026-07-15, so no return can be computed there. My
  sister gave me the money on 6/26, and that gap is filled as "0% real return" in
  `fundData.ts`; the floor still accrues.
- `getUserAccountReturnRates` is not enabled for this account, so the return rate
  has to be derived from the total value.
- **No candlesticks.** The account history has a single `total_value` per day —
  no open/high/low/close, so a candle chart would be missing three of its four
  numbers. The account chart is a line, like the one in the Robinhood app.
- Snapshots are filed by **New York calendar day** (`scripts/trading-day.mjs`).
  Using a UTC date would file a post-20:00 ET sync into a day that has not opened
  yet.

## Configuration

`.env.local` (never committed):

```
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
```

The account ID lives in `scripts/config.mjs`; the starting capital lives in
`ACCOUNT_BASE_CAPITAL` in `src/lib/fundData.ts`.
