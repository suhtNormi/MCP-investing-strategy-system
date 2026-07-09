import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "portfolio.json");
const PLAN_FILE = path.join(DATA_DIR, "investment-plan.json");

const LEGACY_FILE = path.join(os.homedir(), ".portfolio-mcp", "portfolio.json");
if (!fs.existsSync(DATA_FILE) && fs.existsSync(LEGACY_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(LEGACY_FILE, DATA_FILE);
    console.error(`[portfolio-mcp] migrated portfolio from ${LEGACY_FILE} to ${DATA_FILE}`);
}

const AssetType = z.enum([
    "index_fund",
    "dividend_stock",
    "growth_stock",
    "reit",
    "bond",
    "crypto",
    "commodity",
    "cash",
    "other",
]);

const Region = z.enum([
    "global",
    "usa",
    "europe",
    "emerging_markets",
    "baltics",
    "nordics",
    "asia_pacific",
    "other",
]);

const Holding = z.object({
    name: z.string(),
    ticker: z.string().optional(),
    type: AssetType,
    region: Region,
    amountEur: z.number().nonnegative(),
    costBasisEur: z.number().nonnegative().optional(),
    snapshotPrice: z.number().positive().optional(),
    snapshotAt: z.string().optional(),
    notes: z.string().optional(),
});
type Holding = z.infer<typeof Holding>;

function loadPortfolio(): Holding[] {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        return z.array(Holding).parse(JSON.parse(raw));
    } catch {
        return [];
    }
}

function savePortfolio(holdings: Holding[]): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(holdings, null, 2));
}

// Yahoo Finance public chart endpoint for price lookup

async function fetchQuote(ticker: string): Promise<number | null> {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) return null;
        const json: any = await res.json();
        const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
        return typeof price === "number" && price > 0 ? price : null;
    } catch {
        return null;
    }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyPrice(h: Holding, price: number): "initialized" | "updated" {
    if (!h.snapshotPrice || !h.costBasisEur) {
        h.costBasisEur = h.costBasisEur ?? h.amountEur;
        h.snapshotPrice = price;
        h.snapshotAt = new Date().toISOString();
        return "initialized";
    }
    h.amountEur = round2(h.costBasisEur * (price / h.snapshotPrice));
    return "updated";
}

function pct(part: number, total: number): string {
    return total === 0 ? "0%" : `${((part / total) * 100).toFixed(1)}%`;
}

function breakdown(holdings: Holding[]) {
    const total = holdings.reduce((s, h) => s + h.amountEur, 0);
    const by = (key: (h: Holding) => string) => {
        const map = new Map<string, number>();
        for (const h of holdings) map.set(key(h), (map.get(key(h)) ?? 0) + h.amountEur);
        return Object.fromEntries(
            [...map.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => [k, { eur: v, share: pct(v, total) }]),
        );
    };
    const largest = [...holdings].sort((a, b) => b.amountEur - a.amountEur)[0];
    const singleNames = holdings.filter(
        (h) => h.type === "dividend_stock" || h.type === "growth_stock" || h.type === "reit",
    );

    const withBasis = holdings.filter((h) => (h.costBasisEur ?? 0) > 0);
    const cost = withBasis.reduce((s, h) => s + (h.costBasisEur ?? 0), 0);
    const current = withBasis.reduce((s, h) => s + h.amountEur, 0);
    const earnings =
        cost > 0
            ? {
                costBasisEur: round2(cost),
                currentEur: round2(current),
                gainEur: round2(current - cost),
                gainPct: `${(((current - cost) / cost) * 100).toFixed(2)}%`,
                coveredPositions: withBasis.length,
                note:
                    withBasis.length < holdings.length
                        ? `${holdings.length - withBasis.length} position(s) have no cost basis yet — save them once (or run refresh_prices with tickers set) to start tracking.`
                        : undefined,
            }
            : null;

    return {
        totalEur: total,
        positions: holdings.length,
        earnings,
        byType: by((h) => h.type),
        byRegion: by((h) => h.region),
        concentration: {
            largestPosition: largest
                ? { name: largest.name, share: pct(largest.amountEur, total) }
                : null,
            singleStockCount: singleNames.length,
            singleStockShare: pct(
                singleNames.reduce((s, h) => s + h.amountEur, 0),
                total,
            ),
        },
    };
}

// HERE YOU CAN STEER THE AI TO YOUR REFERENCES

const REFERENCES = {
    marten_kress: {
        who: "Ex pension fund manager (2006-2016), ex state treasury risk manager, runs dividendinvestor.ee and Miljoniklubi.",
        principles: [
            "Write an 'investment declaration' first: goal, horizon, asset allocation, allowed universe, constraints. It is the basis for all decisions.",
            "Asset allocation is the primary risk-management tool. Equities swing 15-20%/yr; 100% US equities has seen ~-50% peak-to-trough. 80/20 stocks/bonds historically cut max drawdown to ~-41%, 60/40 to ~-31%.",
            "Barbell structure: high-risk equities on one end, a zero-risk cash 'peace of mind fund' (6-9 months of essential expenses) on the other.",
            "Three pockets: emergency fund; long-term portfolio (~85-90% of investable assets); speculative/trading pocket capped at ~10-15% to quarantine gambling urges.",
            "Diversify heavily within equities: his own portfolio holds ~60 single names (~30 dividend, ~20 growth, 10 REITs) plus ~20% ETFs within equities, plus small slices of bonds, commodities ETF, and crypto (BTC/ETH/SOL, a couple of %).",
            "Largely avoids the Baltic exchanges: hard to find companies with adequate, growing dividend policies; dividend setbacks come easily (Tallinna Vesi, Olympic).",
            "Beginners should focus on regular purchases of broad, low-cost ETFs before single stocks.",
        ],
        sources: [
            "https://www.dividendinvestor.ee/2025/07/02/juuni-kokkuvote-minu-investeerimisportfelli-jaotus-ja-uut-visiooni-otsimas/",
            "https://www.dividendinvestor.ee/2024/07/04/juuni-kokkuvote-parim-riskijuhtimise-nipp-pikaajalise-investori-jaoks/",
            "https://www.dividendinvestor.ee/2016/05/08/varade-jaotamine-alamportfellideks-kolme-tasku-susteem/",
        ],
    },
    kristi_saare: {
        who: "Investor, 'Aasta investor 2021', founder of Naisinvestorite klubi, ex Tuleva community lead, author of 'Kuidas alustada investeerimisega?', blogs at kristiinvesteerib.ee.",
        principles: [
            "Portfolio in rough thirds: real estate (Mustamäe), US index funds, and bonds, plus a small 'play money' pocket for options trading.",
            "Index funds are the long-term core; single picks and speculation stay small and quarantined.",
            "Runs without a traditional emergency fund: a liquid portfolio plus stable, planned income substitutes for a large cash buffer. Buffers are a design choice.",
            "Pay yourself first. If nothing remains after that, the problem is income, not budgeting - focus on increasing income; no spreadsheet rescues a low income.",
            "Increasing active income compounds portfolio growth far faster than expense cuts once savings hit a wall ('10x growth problem').",
            "Withdrawing from the portfolio for a home purchase is a normal part of the journey, not a failure.",
            "Keeps Europe and the Baltics small in the portfolio; US-heavy allocation.",
            "Discipline through market swings matters more than theory; write your strategy down and set a minimum transaction size as the portfolio grows.",
        ],
        sources: [
            "https://kristiinvesteerib.ee/10x-kasvu-probleem/",
            "https://otrjutud.substack.com/p/e40-investeerimine-miljonieesmark",
            "https://investeerimisklubi.ee/investeerimise-tooriistad-kristi-saare-marko-oolo/",
        ],
    },
    general_estonian_context: {
        principles: [
            "Estonian retail investors commonly use investeerimiskonto (investment account) or company structure for tax deferral; realized gains are taxed on withdrawal beyond contributions.",
            "Home bias toward Nasdaq Baltic is common but the market is small, illiquid, and sector-concentrated (energy, infrastructure, banking).",
            "Broad UCITS accumulating ETFs are the usual tax-efficient core for Estonian investors.",
        ],
    },
} as const;

// investment plan
const PLAN_GUIDE = {
    instructions:
        "Run this as a guided interview, wizard-style: take ONE section at a time, in order. For each section: (1) share the 'truths' so the user decides with context, (2) ask the question conversationally, (3) propose a concrete draft answer based on what you know of their situation (call get_portfolio first!), (4) confirm or revise with the user, then move to the next section. Never dump all questions at once; never present a blank form. When every section is answered, call save_investment_plan with the final text of each section, then read the saved plan back to the user.",
    sections: [
        {
            key: "goal",
            title: "Goal",
            ask: "What is the money for, and how much is 'enough'? A number or a lifestyle, but concrete.",
            truths: [
                { who: "Kress", truth: "The declaration starts with the goal — every later rule exists to serve it, not the other way around." },
                { who: "Saare", truth: "Her goal was a concrete million with a deadline; vague goals produce vague behavior." },
            ],
        },
        {
            key: "horizon",
            title: "Horizon",
            ask: "When will the money be needed — decades, or is part of it needed sooner (home, sabbatical)?",
            truths: [
                { who: "Kress", truth: "Horizon determines how much equity risk is survivable: 100% equities has meant ~-50% peak-to-trough on the way." },
                { who: "Saare", truth: "Withdrawing for a home mid-journey is normal, not failure — plan for it instead of pretending it won't happen." },
            ],
        },
        {
            key: "targetAllocation",
            title: "Target allocation",
            ask: "What is the target split between equities, bonds, cash, real estate, and speculation — in percentages?",
            truths: [
                { who: "Kress", truth: "Asset allocation is the primary risk tool: 80/20 stocks/bonds historically cut max drawdown to ~-41%, 60/40 to ~-31%." },
                { who: "Kress", truth: "Barbell: high-risk equities on one end, zero-risk cash on the other; the middle matters less." },
                { who: "Saare", truth: "Rough thirds — real estate, US index funds, bonds — with a small play pocket. Simple enough to actually maintain." },
            ],
        },
        {
            key: "allowedInstruments",
            title: "Allowed universe",
            ask: "Which instruments are allowed in the long-term portfolio (broad UCITS ETFs, single dividend names, bonds...), and which are explicitly excluded?",
            truths: [
                { who: "Kress", truth: "Beginners: regular purchases of broad, low-cost ETFs before single stocks. Singles only at a width where no dividend cut matters." },
                { who: "Kress", truth: "He largely avoids Baltic exchanges — adequate, growing dividend policies are scarce there." },
                { who: "both", truth: "For Estonian investors, accumulating UCITS ETFs inside an investeerimiskonto are the usual tax-efficient core." },
            ],
        },
        {
            key: "monthlyInvestment",
            title: "Monthly contribution",
            ask: "How much goes in every month, taken out before anything else — and where does it go by default?",
            truths: [
                { who: "Saare", truth: "Pay yourself first. If nothing is left after that, it's an income problem, not a budgeting problem." },
                { who: "Saare", truth: "Set a minimum transaction size as the portfolio grows — your time is a cost too." },
            ],
        },
        {
            key: "bufferPolicy",
            title: "Buffer policy",
            ask: "How many months of essential costs stay in zero-risk cash, and where is the line where you'd rebuild it before investing more?",
            truths: [
                { who: "Kress", truth: "6–9 months of essential expenses in a 'peace of mind fund' — the calm end of the barbell." },
                { who: "Saare", truth: "Counter-view: a large liquid portfolio plus stable income can substitute for a big cash buffer. A design choice, not dogma — but only once the portfolio is genuinely large." },
            ],
        },
        {
            key: "speculationCap",
            title: "Speculation cap",
            ask: "What hard percentage of liquid assets may sit in the play pocket (single-stock bets, options, crypto punts), and what happens when it outgrows the cap?",
            truths: [
                { who: "Kress", truth: "Cap the speculative pocket at ~10–15% so gambling urges never touch the long-term core." },
                { who: "Saare", truth: "Her options trading lives in a small, explicitly separate pocket — a hobby line, not a strategy." },
            ],
        },
        {
            key: "incomePlan",
            title: "Income plan",
            ask: "What is the concrete next move to increase income (raise, switch, side income), and by how much per month?",
            truths: [
                { who: "Saare", truth: "Past a savings wall, raising income compounds the portfolio far faster than any expense cut — the '10x growth problem'." },
            ],
        },
        {
            key: "rebalancing",
            title: "Rebalancing & rules",
            ask: "When do you rebalance back to target (calendar? threshold?), and what is the rule for market crashes — what will you do when the portfolio is -40%?",
            truths: [
                { who: "Kress", truth: "Decisions follow the written document, not the mood — the declaration exists precisely for the -40% day." },
                { who: "Saare", truth: "Discipline through swings matters more than theory. Write down what you'll do in advance." },
            ],
        },
        {
            key: "reviewCadence",
            title: "Review cadence",
            ask: "How often is the plan itself reviewed and under what conditions may it be changed (never mid-crash)?",
            truths: [
                { who: "Kress", truth: "He publishes a monthly portfolio review; the declaration itself changes rarely and deliberately." },
            ],
        },
        {
            key: "constraints",
            title: "Constraints & notes (optional)",
            ask: "Anything else binding: ethical exclusions, tax setup (investeerimiskonto/company), liquidity needs, maximum position sizes?",
            truths: [
                { who: "context", truth: "Estonian investors defer tax via investeerimiskonto or a company structure; the plan should say which applies." },
            ],
        },
    ],
} as const;

const PlanSections = {
    goal: z.string(),
    horizon: z.string(),
    targetAllocation: z.string(),
    allowedInstruments: z.string(),
    monthlyInvestment: z.string(),
    bufferPolicy: z.string(),
    speculationCap: z.string(),
    incomePlan: z.string(),
    rebalancing: z.string(),
    reviewCadence: z.string(),
    constraints: z.string().optional(),
};

function loadPlan(): Record<string, unknown> | null {
    try {
        return JSON.parse(fs.readFileSync(PLAN_FILE, "utf-8"));
    } catch {
        return null;
    }
}

// MCP server setup

const server = new McpServer({ name: "portfolio-mcp", version: "1.2.0" });

server.registerTool(
    "upsert_holding",
    {
        title: "Add or update a holding",
        description:
            "Add a holding to the portfolio, or update it if a holding with the same name exists. " +
            "Provide a Yahoo Finance ticker (e.g. SXR8.DE, TSM1T.TL, AAPL) whenever you can: on first save the current " +
            "price is snapshotted and amountEur becomes the cost basis, so refresh_prices can track earnings from then on.",
        inputSchema: Holding.omit({ costBasisEur: true, snapshotPrice: true, snapshotAt: true }).shape,
    },
    async (input) => {
        const holdings = loadPortfolio();
        const idx = holdings.findIndex(
            (h) => h.name.toLowerCase() === input.name.toLowerCase(),
        );
        const existing = idx >= 0 ? holdings[idx] : undefined;
        const holding: Holding = { ...existing, ...Holding.parse({ ...input }) };

        if (existing && existing.ticker === holding.ticker) {
            holding.costBasisEur = existing.costBasisEur;
            holding.snapshotPrice = existing.snapshotPrice;
            holding.snapshotAt = existing.snapshotAt;
        } else {
            holding.costBasisEur = holding.amountEur;
            holding.snapshotPrice = undefined;
            holding.snapshotAt = undefined;
        }

        let priceNote = "";
        if (holding.ticker && !holding.snapshotPrice) {
            const price = await fetchQuote(holding.ticker);
            if (price) {
                applyPrice(holding, price);
                priceNote = ` Snapshotted ${holding.ticker} at ${price} — earnings tracking starts now.`;
            } else {
                priceNote = ` Could not fetch a price for ticker "${holding.ticker}" — check the Yahoo Finance symbol; earnings tracking starts once refresh_prices finds it.`;
            }
        }

        if (idx >= 0) holdings[idx] = holding;
        else holdings.push(holding);
        savePortfolio(holdings);
        return {
            content: [
                { type: "text", text: `Saved "${holding.name}" (${holding.amountEur} EUR). Portfolio now has ${holdings.length} positions.${priceNote}` },
            ],
        };
    },
);

server.registerTool(
    "remove_holding",
    {
        title: "Remove a holding",
        description: "Remove a holding from the portfolio by name.",
        inputSchema: { name: z.string() },
    },
    async ({ name }) => {
        const holdings = loadPortfolio();
        const next = holdings.filter((h) => h.name.toLowerCase() !== name.toLowerCase());
        savePortfolio(next);
        const removed = holdings.length - next.length;
        return {
            content: [
                { type: "text", text: removed ? `Removed "${name}".` : `No holding named "${name}" found.` },
            ],
        };
    },
);

server.registerTool(
    "get_portfolio",
    {
        title: "Get portfolio with analysis",
        description:
            "Returns all holdings plus computed breakdowns: totals, earnings vs cost basis (percentage), allocation by asset type and region, and concentration metrics. " +
            "Earnings reflect the last refresh_prices run — call refresh_prices first for live numbers.",
        inputSchema: {},
    },
    async () => {
        const holdings = loadPortfolio();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ holdings, analysis: breakdown(holdings) }, null, 2),
                },
            ],
        };
    },
);

server.registerTool(
    "refresh_prices",
    {
        title: "Refresh prices & compute earnings",
        description:
            "Fetches current prices from Yahoo Finance for every holding that has a ticker, updates each holding's current value " +
            "(costBasisEur × currentPrice / snapshotPrice — currency-independent), saves the file, and returns per-holding and " +
            "total earnings percentages. Holdings without a ticker are left untouched. Run this before answering questions about performance.",
        inputSchema: {},
    },
    async () => {
        const holdings = loadPortfolio();
        const results: object[] = [];
        let updated = 0, initialized = 0, failed = 0;

        for (const h of holdings) {
            if (!h.ticker) continue;
            const price = await fetchQuote(h.ticker);
            if (!price) {
                failed++;
                results.push({ name: h.name, ticker: h.ticker, status: "price lookup failed — check the Yahoo Finance symbol" });
                continue;
            }
            const what = applyPrice(h, price);
            if (what === "initialized") initialized++;
            else updated++;
            const gainPct =
                h.costBasisEur && h.costBasisEur > 0
                    ? `${(((h.amountEur - h.costBasisEur) / h.costBasisEur) * 100).toFixed(2)}%`
                    : "n/a";
            results.push({ name: h.name, ticker: h.ticker, price, currentEur: h.amountEur, costBasisEur: h.costBasisEur, gainPct, status: what });
        }

        savePortfolio(holdings);
        const noTicker = holdings.filter((h) => !h.ticker).length;
        const summary = breakdown(holdings).earnings;
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            updated, initialized, failed, skippedNoTicker: noTicker,
                            note: initialized > 0 ? "Initialized positions had no price baseline yet — their earnings start from today." : undefined,
                            positions: results,
                            portfolioEarnings: summary,
                        },
                        null, 2,
                    ),
                },
            ],
        };
    },
);

server.registerTool(
    "get_estonian_investor_references",
    {
        title: "Estonian investor reference principles",
        description:
            "Curated, paraphrased portfolio principles from prominent Estonian investors (Märten Kress / dividendinvestor.ee, Kristi Saare / kristiinvesteerib.ee) with source URLs, for benchmarking the user's portfolio. Combine with web search for the freshest views.",
        inputSchema: {},
    },
    async () => ({
        content: [{ type: "text", text: JSON.stringify(REFERENCES, null, 2) }],
    }),
);

server.registerTool(
    "get_investment_plan_guide",
    {
        title: "Investment plan interview guide",
        description:
            "Returns the guided-interview structure for writing the user's investment plan (Kress's 'investment declaration'). " +
            "Use this when the user wants to create or rewrite their investment plan: follow the embedded instructions — one section " +
            "at a time, grounded in the reference investors' published truths, ending with save_investment_plan.",
        inputSchema: {},
    },
    async () => ({
        content: [{ type: "text", text: JSON.stringify(PLAN_GUIDE, null, 2) }],
    }),
);

server.registerTool(
    "save_investment_plan",
    {
        title: "Save the investment plan",
        description:
            "Persists the completed investment plan to data/investment-plan.json after the guided interview. " +
            "Each field is the final agreed text of that section. Overwrites any previous plan (the dashboard shows it and marks the 'written plan' scorecard rows as passed).",
        inputSchema: PlanSections,
    },
    async (input) => {
        const existing = loadPlan();
        const plan = {
            createdAt: (existing?.createdAt as string) ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sections: input,
        };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
        return {
            content: [
                { type: "text", text: `Investment plan saved to ${PLAN_FILE}. The dashboard will show it on next refresh.` },
            ],
        };
    },
);

server.registerTool(
    "get_investment_plan",
    {
        title: "Get the saved investment plan",
        description:
            "Returns the user's saved investment plan (declaration), or reports that none exists yet. " +
            "Use it to check decisions against the user's own written rules before recommending changes.",
        inputSchema: {},
    },
    async () => {
        const plan = loadPlan();
        return {
            content: [
                {
                    type: "text",
                    text: plan
                        ? JSON.stringify(plan, null, 2)
                        : "No investment plan saved yet. Offer to write one together — call get_investment_plan_guide to run the guided interview.",
                },
            ],
        };
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);
