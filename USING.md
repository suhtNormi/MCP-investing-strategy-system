# USING.md — a day-to-day (and month-to-month) guide

This walks through actually *living with* the tool: buying, saving, paying the mortgage, getting a raise, and steering your money over a first quarter. It assumes everything is already installed and built (see [BASIC.md](BASIC.md) for setup).

Two front ends, **one source of truth** — the JSON files in `data/`:

- **The dashboard** — `npm run dashboard`, a browser wizard + dashboard. You *see* your system and move levers.
- **Claude in the terminal** — the `portfolio` MCP server. You *tell* Claude what happened in plain language and it edits the same files.

Neither watches the other live. Edit on one side, then refresh / re-ask on the other.

> **Project directory** — wherever you cloned this repo. Substitute your own path for `path/to/MCP-investing-strategy-system` throughout this guide.
>
> The `portfolio` MCP is registered **globally**, so `claude` can reach it from anywhere. But everything below **navigates into the project first** — it keeps you in one mental place, and it's where `npm run dashboard` and the `data/` files live:
> ```bash
> cd path/to/MCP-investing-strategy-system
> ```

---

## Section 1 — Every feature you'll use, and how to invoke it

### A. Terminal / CLI commands

| What | Command | When |
| ---- | ------- | ---- |
| Go to the project | `cd path/to/MCP-investing-strategy-system` | Before every session below |
| Confirm the MCP is connected | `claude mcp list` | Whenever Claude "can't see" your portfolio. Look for `portfolio: … - ✓ Connected` |
| Start a Claude conversation | `claude` | Every time you want to tell Claude something or ask a question |
| List the MCP's tools (inside a session) | `/mcp` | To confirm the 12 tools are loaded after a rebuild |
| Open the visual dashboard | `npm run dashboard` → open http://localhost:5173/ | Whenever you want the full picture, meters, and scorecards |
| Rebuild the MCP after editing `src/index.ts` | `npm run build`, then start a **new** `claude` session | Only if you change the server code |

> A `claude` session that is already open keeps the old server process. After `npm run build`, **quit and reopen** `claude` so it picks up tool changes.

### B. What you say to Claude → which MCP tool fires

You never name tools; you just talk. This maps plain requests to the 12 tools so you know what's possible.

**Portfolio (holdings)**
- *"Add 300 € of Microsoft, ticker MSFT, US growth stock, to my portfolio."* → `upsert_holding` (snapshots the price so earnings track from today)
  - **Every add/update is verified first** against the investors' principles and your resulting balances (single-name concentration, the 10–15 % speculation fence, Baltic home bias, index core below both investors' bar, no ballast, buffer unfilled before a speculative buy). If the purchase breaks a bar, **nothing is saved** — Claude tells you the reason and asks whether you want it anyway; only your explicit "yes, add it" saves it.
- *"Change my Amundi position to 800 €."* → `upsert_holding` (updates by name, same verification)
- *"Remove Tallinna Sadam."* → `remove_holding`
- *"Pull my portfolio and analyse it."* → `get_portfolio` (totals, earnings %, allocation, concentration)
- *"Refresh my prices and tell me how I'm doing."* → `refresh_prices` (live Yahoo Finance quotes → earnings %)

**Money system (the non-portfolio levers)**
- *"What does my money system look like?"* → `get_money_system` (free cash, savings rate, buffer vs target, home/mortgage breakdown)
- *"My salary is now 3200."* / *"Set my buffer target to 4 months."* / *"My mortgage balance is 78 000."* → `update_money_system`
- *"Paid my mortgage — 550 of it was principal."* → `log_mortgage_payment` (moves principal from loan into home equity)
- *"Put 300 into savings."* / *"Took 200 out of the buffer."* → `log_buffer_change`

**Investment declaration & the reference investors**
- *"What do Kress and Saare actually recommend?"* → `get_estonian_investor_references`
- *"Help me write my investment plan."* → `get_investment_plan_guide` → a guided interview → `save_investment_plan`
- *"Check this decision against my written plan."* → `get_investment_plan`

### C. Dashboard features (browser)

- **Setup wizard** (first run): (1) money in & out, (2) safety net — buffer, **your buffer target in months**, home equity, **remaining mortgage**, (3) your assets, (4) monthly decisions.
- **Your investment declaration** — leads the page; **Edit** opens an inline editor (all 11 sections) as an alternative to writing it via Claude.
- **What to fix first** — ranks your gaps against both investors' bars, worst first, with a concrete "→ do this" line.
- **Home & mortgage** — property value, your equity, remaining loan, % owned outright.
- **Portfolio risk** — 2008-style stress test + exposure meters.
- **A good portfolio, their way** — Kress-style / Saare-style target mix vs your real portfolio, with the pp gap and € move to close it. *"Load this mix as a draft"* to experiment; nothing saves until you hit **Save portfolio**.
- **Two scorecards** — pass / close / miss against each investor.
- **↻ Refresh prices** (Invested assets card) — same as asking Claude to refresh.

---

## Section 2 — A first quarter, week by week

A realistic three months. Do the setup once, then the monthly rhythm is short.

### Month 0 — Setup (about 20 minutes, once)

1. **Sanity-check the connection.**
   ```bash
   cd path/to/MCP-investing-strategy-system
   claude mcp list
   ```
   You want `portfolio: … - ✓ Connected`. If it's missing, see BASIC.md's registration step.

2. **Run the dashboard wizard** — this is where your numbers first land in `data/money-system.json`.
   ```bash
   npm run dashboard
   ```
   Open http://localhost:5173/ and answer all four steps. On the *Safety net* step, set your **buffer target in months** (Kress recommends 6–9; pick what you'll actually hold), your **home equity**, and your **remaining mortgage balance**. Finish to see the dashboard.

3. **Write your investment declaration** — both investors' first rule. Either hit **Edit** on the *Your investment declaration* card, or do it conversationally:
   ```bash
   claude
   ```
   > Help me write my investment plan.

   Answer one section at a time. When it saves, the "written plan" rows on both scorecards flip to pass. Read the top card — **What to fix first** — and note your #1 gap (very likely the emergency buffer).

### Month 1 — First purchases and the monthly rhythm

You get paid, you invest, you save, you pay the mortgage.

1. **Log a purchase.**
   ```bash
   cd path/to/MCP-investing-strategy-system
   claude
   ```
   > I bought 300 € of Microsoft — ticker MSFT, US growth stock. Add it to my portfolio.

   Claude calls `upsert_holding` — and here the **purchase guard** may kick in. In a small portfolio, 300 € of one company is a big slice, so instead of saving, Claude comes back with something like:

   > ⚠ Not saved yet — Microsoft would be 37 % of your invested portfolio. Kress keeps any single name at a few percent so no single dividend cut matters. Do you still want to add it?

   Say *"yes, add it anyway"* and it saves (recorded as user-confirmed); say no and nothing is written. The same guard watches the speculation fence, Baltic bias, a shrinking index core, missing ballast, and buying speculation before your buffer is filled. It snapshots the price on save, so earnings track from today.

2. **Top up the emergency buffer** (if it's your #1 gap). Same session:
   > I moved 400 € into my savings buffer this month.

   → `log_buffer_change`. Claude tells you how many months of essentials you're at versus your target.

3. **Record the mortgage payment.**
   > Paid my mortgage. The principal part was 520 €.

   → `log_mortgage_payment`. It shifts 520 € from your loan balance into home equity.

4. **See it on the dashboard.** If the dashboard tab is still open, **refresh the page** (it re-reads the files). Microsoft appears under Invested assets; Home & mortgage shows the new equity; the buffer meter moved.

> **Rule of thumb:** tell Claude the *events* ("bought X", "saved Y", "paid Z of principal") as they happen; open the dashboard when you want the *picture*.

### Month 2 — A raise, a bigger portfolio, a check-in

1. **Your income changed.**
   ```bash
   cd path/to/MCP-investing-strategy-system
   claude
   ```
   > My salary is now 3200 net. Also I want to keep planning for a 200 €/month side income.

   → `update_money_system` (income + the "income lever"). The projection chart will now show what that extra income compounds to.

2. **Invest the raise, add a core holding.**
   > Add 500 € of iShares Core S&P 500, ticker SXR8.DE, US index fund.

   → `upsert_holding`.

3. **Refresh performance and review.**
   > Refresh my prices, then pull my portfolio and tell me where it diverges most from Kress's principles.

   → `refresh_prices` + `get_portfolio` + `get_estonian_investor_references`. You get live earnings and a critique grounded in the reference investors.

4. **Open the dashboard, read the scorecards.** Refresh the page. Check **What to fix first** again — as the buffer fills, the top gap may shift to concentration or the missing income lever.

### Month 3 — Steer toward the model, then re-plan

1. **Compare against a "good" mix.** On the dashboard, open **A good portfolio, their way**, pick the Kress or Saare lens. Each bucket shows your real share, the target, the **gap in percentage points**, and the **€ to add or trim**. Hit *Load this mix as a draft* to experiment — nothing saves until you press **Save portfolio** (or *Restore saved* to back out).

2. **Make the actual moves through Claude** (so cost-basis / earnings tracking stays correct rather than overwriting with a synthetic draft):
   ```bash
   cd path/to/MCP-investing-strategy-system
   claude
   ```
   > Based on the Kress mix, I want more global index and less single-name risk. I'm adding 400 € to iShares Core S&P 500 and trimming Microsoft to 150 €.

   → two `upsert_holding` calls.

3. **Check moves against your own rules before committing.**
   > Does trimming Microsoft fit what my written investment plan says about single positions?

   → `get_investment_plan`. If your plan and your action disagree, that's the moment to notice.

4. **Quarterly review.**
   > Refresh prices, then give me a quarter-in-review: portfolio earnings, savings rate, buffer progress toward my target, and the one thing to fix next quarter.

   → `refresh_prices` + `get_portfolio` + `get_money_system`. Update the declaration's *review cadence* section if anything structural changed (Edit on the declaration card, or *"update my investment plan"*).

---

## The short version (once you're in the habit)

Every month, from the project directory:

```bash
cd path/to/MCP-investing-strategy-system
claude
```
Then, in plain language:
- *"Bought … / sold … / removed …"* — holdings
- *"Saved … into the buffer"* / *"paid … of mortgage principal"* — money system
- *"Refresh prices and pull my portfolio"* — performance
- Open `npm run dashboard` and refresh when you want the meters, scorecards, and the "What to fix first" card.

Quarterly: compare against the model mix, re-check the scorecards, and revisit the declaration.
