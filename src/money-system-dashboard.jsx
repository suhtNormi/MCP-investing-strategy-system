import { useState, useMemo, useEffect } from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ReferenceLine,
} from "recharts";

// design tokens
const T = {
    paper: "#f9f9f7",
    card: "#fcfcfb",
    ink: "#0b0b0b",
    inkSoft: "#52514e",
    muted: "#898781",
    line: "#e1e0d9",
    baseline: "#c3c2b7",
    // categorical layer colors — fixed assignment, aqua/yellow always direct-labeled
    buffer: "#2a78d6",   // blue — emergency buffer
    core: "#1baf7a",     // aqua — index core
    satellite: "#eda100",// yellow — dividend satellite
    home: "#008300",     // green — home equity
    play: "#4a3aa7",     // violet — play money
    lever: "#b45309",    // amber accent — the income-lever scenario
    context: "#898781",  // de-emphasis gray — the baseline scenario
    // status fills (white text on top) — distinct from series colors
    ok: "#006300",
    watch: "#9a6a00",
    act: "#ae3b2a",
    mono: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
    sans: "'Segoe UI', system-ui, -apple-system, sans-serif",
};

const eur = (n) =>
    new Intl.NumberFormat("et-EE", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €";
const pct = (x) => (x * 100).toFixed(0) + " %";

// ---------- MCP portfolio schema, mirrors src/index.ts
const TYPES = ["index_fund", "dividend_stock", "growth_stock", "reit", "bond", "crypto", "commodity", "cash", "other"];
const REGIONS = ["global", "usa", "europe", "emerging_markets", "baltics", "nordics", "asia_pacific", "other"];
const TYPE_LABEL = {
    index_fund: "Index fund", dividend_stock: "Dividend stock", growth_stock: "Growth stock",
    reit: "REIT", bond: "Bond", crypto: "Crypto", commodity: "Commodity", cash: "Cash", other: "Other",
};
const REGION_LABEL = {
    global: "Global", usa: "USA", europe: "Europe", emerging_markets: "Emerging markets",
    baltics: "Baltics", nordics: "Nordics", asia_pacific: "Asia-Pacific", other: "Other",
};
const layerOf = (h) => (h.type === "index_fund" ? "core" : "satellite");

// buckets used for risk + model-portfolio comparison
const bucketOf = (h) =>
    h.type === "index_fund" ? "index"
        : ["dividend_stock", "growth_stock", "reit"].includes(h.type) ? "singles"
            : h.type === "bond" ? "bonds"
                : h.type === "cash" ? "cash" : "spec";
const BUCKET_LABEL = { index: "Broad index funds", singles: "Single names & REITs", bonds: "Bonds", cash: "Cash-like", spec: "Crypto / commodity / other" };

// section order + display titles for the investment plan written via Claude
const PLAN_TITLES = {
    goal: "Goal", horizon: "Horizon", targetAllocation: "Target allocation",
    allowedInstruments: "Allowed universe", monthlyInvestment: "Monthly contribution",
    bufferPolicy: "Buffer policy", speculationCap: "Speculation cap", incomePlan: "Income plan",
    rebalancing: "Rebalancing & rules", reviewCadence: "Review cadence", constraints: "Constraints & notes",
};

// rough 2008-style stress drawdowns per asset type (broad-brush, for orientation only)
const CRASH_DD = {
    index_fund: 0.50, growth_stock: 0.55, dividend_stock: 0.45, reit: 0.60,
    bond: 0.10, crypto: 0.80, commodity: 0.30, cash: 0, other: 0.50,
};

// paraphrased public statements from prominent investors
const LENSES = {
    kress: {
        name: "Märten Kress",
        tag: "dividendinvestor.ee · ex pension fund manager",
        color: T.core,
        mindset: [
            "Write an investment declaration first — goal, horizon, allocation, constraints. Decisions follow the document, not the mood.",
            "Asset allocation is the main risk lever: 100% equities has meant ~-50% peak-to-trough; 80/20 cut that to ~-41%, 60/40 to ~-31%.",
            "Barbell: high-risk equities on one end, a zero-risk cash buffer (6–9 months of essential costs) on the other.",
            "Cap the speculative pocket at ~10–15% so gambling urges never touch the long-term core.",
            "Diversify wide inside equities — he holds ~60 names plus ETFs. No single dividend cut should matter.",
            "Largely exited the Baltic exchanges: reliable dividend-growth companies are scarce there.",
        ],
    },
    saare: {
        name: "Kristi Saare",
        tag: "kristiinvesteerib.ee · Aasta investor 2021",
        color: T.buffer,
        mindset: [
            "Portfolio in rough thirds: real estate, US index funds, bonds — plus a small options 'play money' pocket.",
            "Index funds are the core. Investing is simple; discipline through market swings is the hard part.",
            "Runs without a classic emergency fund — a liquid portfolio plus planned income covers it. Buffers are a design choice, not dogma.",
            "Pay yourself first. If nothing is left after that, the problem is income — go increase it. No spreadsheet rescues a low income.",
            "Taking money out for a home is a normal part of the journey, not a failure.",
            "Set a minimum transaction size as the portfolio grows — your time is a cost too.",
        ],
    },
};

// "good" portfolio barbell style
const MODELS = {
    kress: {
        blurb: "His barbell, translated: a broad, cheap equity core with real ballast, singles only at a width where no dividend cut matters, and speculation fenced off.",
        targets: { index: 0.60, singles: 0.15, bonds: 0.20, cash: 0, spec: 0.05 },
        caveat: "Singles earn their 15% only if you can hold 10+ names — below that width he'd fold them into the index core.",
        build: (total) => [
            { name: "Global developed index ETF (e.g. MSCI World)", type: "index_fund", region: "global", amountEur: Math.round(total * 0.50) },
            { name: "Emerging markets index ETF", type: "index_fund", region: "emerging_markets", amountEur: Math.round(total * 0.10) },
            { name: "Dividend basket — 10+ names, no Baltic tilt", type: "dividend_stock", region: "europe", amountEur: Math.round(total * 0.15) },
            { name: "Aggregate bond ETF", type: "bond", region: "global", amountEur: Math.round(total * 0.20) },
            { name: "Crypto sliver (BTC/ETH)", type: "crypto", region: "global", amountEur: Math.round(total * 0.05) },
        ],
    },
    saare: {
        blurb: "Her system, translated: a US-heavy index core doing the compounding, bonds as the stabilizer, and a small quarantined pocket for the fun trades.",
        targets: { index: 0.70, singles: 0, bonds: 0.25, cash: 0, spec: 0.05 },
        caveat: "Her real 'thirds' include income-producing real estate — home equity you live in doesn't count. Single picks live inside the play pocket, not the portfolio.",
        build: (total) => [
            { name: "US index fund (S&P 500 / total market)", type: "index_fund", region: "usa", amountEur: Math.round(total * 0.55) },
            { name: "Global index ETF", type: "index_fund", region: "global", amountEur: Math.round(total * 0.15) },
            { name: "Aggregate bond ETF", type: "bond", region: "global", amountEur: Math.round(total * 0.25) },
            { name: "Options / play pocket", type: "other", region: "usa", amountEur: Math.round(total * 0.05) },
        ],
    },
};

// profile persistence in localStorage
const PROFILE_KEY = "money-system-profile-v1";
const DEFAULT_PROFILE = {
    income: 2600, expenses: 1200, housingPmt: 650,
    bufferEur: 3000, homeEquity: 25000,
    investEur: 500, extraIncome: 0, playEur: 0, annualReturn: 7, hasPlan: false,
};
const loadProfile = () => {
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : null;
    } catch { return null; }
};

const Card = ({ title, sub, onEdit, children, style }) => (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 20, ...style }}>
        {title && (
            <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                    <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 600 }}>{title}</div>
                    {sub && <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 3 }}>{sub}</div>}
                </div>
                {onEdit && (
                    <button onClick={onEdit} style={{
                        fontSize: 12, fontWeight: 600, color: T.buffer, background: "none",
                        border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap",
                    }}>Edit</button>
                )}
            </div>
        )}
        {children}
    </div>
);

const Num = ({ children, color = T.ink, size = 15 }) => (
    <span style={{ fontFamily: T.mono, fontWeight: 600, color, fontSize: size }}>{children}</span>
);

const Field = ({ label, why, children }) => (
    <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{label}</label>
        {children}
        {why && <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.5, maxWidth: 560 }}>{why}</div>}
    </div>
);

const MoneyInput = ({ value, onChange, max = 500000, step = 50, width = 95 }) => (
    <input
        type="number" value={value} min={0} max={max} step={step}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        style={{
            width, fontFamily: T.mono, fontSize: 14, fontWeight: 600, padding: "7px 9px",
            border: `1px solid ${T.baseline}`, borderRadius: 8, textAlign: "right", background: "#fff",
        }}
        aria-label="amount in euros"
    />
);

const RangeWithValue = ({ value, onChange, min, max, step = 50, format = eur, accent = T.ink }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14, maxWidth: 560 }}>
        <input
            type="range" min={min} max={max} step={step} value={Math.min(value, max)}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: accent }}
        />
        <Num color={accent} size={16}>{format(value)}</Num>
    </div>
);

const Pill = ({ status }) => {
    const map = {
        ok: { c: T.ok, t: "✓ pass" },
        watch: { c: T.watch, t: "! close" },
        act: { c: T.act, t: "✕ miss" },
    }[status];
    return (
        <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "#fff", background: map.c, borderRadius: 99, padding: "3px 9px", whiteSpace: "nowrap",
        }}>{map.t}</span>
    );
};

const StatTile = ({ label, value, note, color = T.ink }) => (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color, margin: "2px 0", letterSpacing: "-0.01em" }}>{value}</div>
        {note && <div style={{ fontSize: 12, color: T.inkSoft }}>{note}</div>}
    </div>
);

// a single ratio against a limit — meter with threshold ticks
const Meter = ({ label, value, watchAt, actAt, note }) => {
    const s = value >= actAt ? "act" : value >= watchAt ? "watch" : "ok";
    const color = { ok: T.ok, watch: T.watch, act: T.act }[s];
    const scale = Math.max(actAt * 1.4, value * 1.1, 0.01);
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{label} <span style={{ color: T.inkSoft, fontWeight: 400 }}>· {note}</span></span>
                <Num color={color}>{pct(value)}</Num>
            </div>
            <div style={{ position: "relative", height: 12, background: T.paper, borderRadius: 6 }}>
                <div style={{ width: `${Math.min(100, (value / scale) * 100)}%`, height: "100%", background: color, borderRadius: 6, transition: "width 300ms ease" }} />
                {[watchAt, actAt].map((t, i) => (
                    <div key={i} title={`${i === 0 ? "watch" : "limit"} at ${pct(t)}`} style={{
                        position: "absolute", left: `${(t / scale) * 100}%`, top: -2, bottom: -2, width: 2,
                        background: i === 0 ? T.baseline : T.act, borderRadius: 1,
                    }} />
                ))}
            </div>
        </div>
    );
};

const selStyle = {
    fontSize: 13, padding: "7px 8px", border: `1px solid ${T.baseline}`, borderRadius: 6, background: "#fff", fontFamily: T.sans,
};

const th = { textAlign: "left", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, fontWeight: 700, padding: "6px 8px 6px 0" };
const td = { fontSize: 12.5, lineHeight: 1.45, padding: "8px 8px 8px 0", borderTop: `1px solid ${T.line}`, verticalAlign: "top" };

// scorecard table for one investor
const ScoreTable = ({ rows }) => {
    const passed = rows.filter((r) => r.s === "ok").length;
    return (
        <>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
                Verdict: <Num color={passed === rows.length ? T.ok : passed >= rows.length / 2 ? T.watch : T.act}>{passed} / {rows.length}</Num>
                <span style={{ color: T.inkSoft }}> principles passed</span>
            </div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                        <tr>
                            <th style={th}>Principle</th>
                            <th style={th}>Their bar</th>
                            <th style={th}>You</th>
                            <th style={{ ...th, paddingRight: 0 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i}>
                                <td style={{ ...td, fontWeight: 600, minWidth: 110 }}>{r.rule}</td>
                                <td style={{ ...td, color: T.inkSoft }}>{r.bar}</td>
                                <td style={{ ...td, fontFamily: T.mono, whiteSpace: "nowrap" }}>{r.you}</td>
                                <td style={{ ...td, paddingRight: 0 }}><Pill status={r.s} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
};

// wizard steps
const STEPS = [
    { title: "Money in & out", q: "What flows through your month?" },
    { title: "Safety net", q: "What catches you if income stops?" },
    { title: "Your assets", q: "What do you own today?" },
    { title: "Monthly decisions", q: "What will you do with the free cash?" },
];

// main
export default function MoneySystemDashboard() {
    const saved = useMemo(loadProfile, []);
    const [profile, setProfile] = useState(saved ?? DEFAULT_PROFILE);
    // step 0..3 = wizard, 4 = dashboard. Returning users (or ?view=dashboard) go straight to the dashboard.
    const forceDash = new URLSearchParams(window.location.search).get("view") === "dashboard";
    const [step, setStep] = useState(saved || forceDash ? 4 : 0);
    const [holdings, setHoldings] = useState([]);
    const [saveState, setSaveState] = useState("");
    const [draftFrom, setDraftFrom] = useState(null); // lens key when a model mix is loaded, unsaved
    const [lens, setLens] = useState("kress");
    const [plan, setPlan] = useState(null);           // investment plan written via Claude's guided interview
    const [priceMsg, setPriceMsg] = useState("");

    const set = (field) => (v) => setProfile((p) => ({ ...p, [field]: v }));
    const { income, expenses, housingPmt, bufferEur, homeEquity, investEur, extraIncome, playEur, annualReturn, hasPlan } = profile;

    // load the portfolio the MCP server maintains
    const fetchHoldings = () =>
        fetch("/api/portfolio")
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => { if (Array.isArray(data)) setHoldings(data); })
            .catch(() => { });
    useEffect(() => {
        fetchHoldings();
        fetch("/api/plan")
            .then((r) => (r.ok ? r.json() : null))
            .then((p) => { if (p && p.sections) setPlan(p); })
            .catch(() => { });
    }, []);

    // a saved plan file counts as a written plan, regardless of the wizard answer
    const effHasPlan = hasPlan || !!plan;

    const persistProfile = () => localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

    const saveHoldings = async () => {
        setSaveState("saving");
        try {
            const clean = holdings
                .filter((h) => h.name.trim() !== "")
                .map((h) => {
                    const amountEur = Number(h.amountEur) || 0;
                    return {
                        ...h,
                        amountEur,
                        ticker: h.ticker?.trim() ? h.ticker.trim() : undefined,
                        // snapshot on first save: the entered amount becomes the cost basis
                        costBasisEur: Number(h.costBasisEur) > 0 ? Number(h.costBasisEur) : amountEur,
                    };
                });
            const r = await fetch("/api/portfolio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(clean),
            });
            setSaveState(r.ok ? "saved" : "error");
            if (r.ok) { setHoldings(clean); setDraftFrom(null); }
        } catch { setSaveState("error"); }
    };

    const next = async () => {
        if (step === 2) await saveHoldings();
        if (step === 3) persistProfile();
        setStep(step + 1);
    };

    const refreshPrices = async () => {
        setPriceMsg("fetching…");
        try {
            const r = await fetch("/api/refresh-prices", { method: "POST" });
            if (!r.ok) { setPriceMsg("refresh failed"); return; }
            const { holdings: fresh, updated, initialized, failed, skippedNoTicker } = await r.json();
            setHoldings(fresh);
            setDraftFrom(null);
            const parts = [];
            if (updated) parts.push(`${updated} updated`);
            if (initialized) parts.push(`${initialized} baseline set`);
            if (failed) parts.push(`${failed} ticker(s) not found`);
            if (skippedNoTicker) parts.push(`${skippedNoTicker} without ticker`);
            setPriceMsg(parts.length ? parts.join(" · ") : "nothing to refresh — add tickers first");
        } catch { setPriceMsg("refresh failed"); }
    };

    // derivates
    const d = useMemo(() => {
        const amt = (h) => Number(h.amountEur) || 0;
        const invested = holdings.reduce((s, h) => s + amt(h), 0);
        const core = holdings.filter((h) => layerOf(h) === "core").reduce((s, h) => s + amt(h), 0);
        const satellite = invested - core;
        const baltic = holdings.filter((h) => h.region === "baltics").reduce((s, h) => s + amt(h), 0);
        const usGlobal = holdings.filter((h) => h.region === "usa" || h.region === "global").reduce((s, h) => s + amt(h), 0);
        const netWorth = invested + bufferEur + homeEquity + playEur;
        const liquid = invested + bufferEur + playEur;
        const essentials = expenses + housingPmt;
        const freeCash = income - essentials;
        const savingsRate = income > 0 ? Math.max(0, freeCash) / income : 0;
        const bufferMonths = essentials > 0 ? bufferEur / essentials : 0;
        const liquidMonths = essentials > 0 ? liquid / essentials : 0;
        const invest = Math.min(investEur, Math.max(0, freeCash));
        const slack = Math.max(0, freeCash - invest);

        // buckets
        const buckets = { index: 0, singles: 0, bonds: 0, cash: 0, spec: 0 };
        for (const h of holdings) buckets[bucketOf(h)] += amt(h);
        const share = (v, total = invested) => (total > 0 ? v / total : 0);

        // risk metrics
        const singles = holdings.filter((h) => bucketOf(h) === "singles");
        const largestSingle = singles.reduce((m, h) => (amt(h) > amt(m) ? h : m), { amountEur: 0, name: "—" });

        // earnings vs cost basis (only over holdings that have a recorded basis)
        const withBasis = holdings.filter((h) => (Number(h.costBasisEur) || 0) > 0);
        const basisCost = withBasis.reduce((s, h) => s + Number(h.costBasisEur), 0);
        const basisCur = withBasis.reduce((s, h) => s + amt(h), 0);
        const earningsPct = basisCost > 0 ? basisCur / basisCost - 1 : null;
        const equityEur = buckets.index + buckets.singles;
        const equityShare = liquid > 0 ? equityEur / liquid : 0;
        const ballastShare = liquid > 0 ? (bufferEur + buckets.bonds + buckets.cash) / liquid : 0;
        const specShare = liquid > 0 ? (buckets.spec + playEur) / liquid : 0;
        const crashLoss = holdings.reduce((s, h) => s + amt(h) * (CRASH_DD[h.type] ?? 0.5), 0) + playEur * 0.8;
        const crashPct = liquid > 0 ? crashLoss / liquid : 0;
        const postCrashLiquid = liquid - crashLoss;

        return {
            invested, core, satellite, baltic, usGlobal, netWorth, liquid, essentials, freeCash,
            savingsRate, bufferMonths, liquidMonths, invest, slack, buckets, share,
            largestSingle, equityShare, ballastShare, specShare, crashLoss, crashPct, postCrashLiquid,
            earningsPct, basisCost, basisCur,
        };
    }, [holdings, bufferEur, homeEquity, playEur, income, expenses, housingPmt, investEur]);

    // projection: your chosen monthly investment, with and without the planned income increase
    const projection = useMemo(() => {
        const r = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
        let a = d.liquid, b = d.liquid;
        const rows = [{ year: 0, base: Math.round(a), lever: Math.round(b) }];
        for (let m = 1; m <= 15 * 12; m++) {
            a = a * (1 + r) + d.invest;
            b = b * (1 + r) + d.invest + extraIncome;
            if (m % 12 === 0) rows.push({ year: m / 12, base: Math.round(a), lever: Math.round(b) });
        }
        return rows;
    }, [d.liquid, d.invest, extraIncome, annualReturn]);
    const leverGain = (projection[10]?.lever ?? 0) - (projection[10]?.base ?? 0);

    // two scorecards
    const kressRows = useMemo(() => {
        const largestShare = d.share(Number(d.largestSingle.amountEur) || 0);
        const balticShare = d.share(d.baltic);
        const coreShare = d.share(d.buckets.index);
        return [
            {
                rule: "Investment declaration", bar: "Goal, horizon, allocation and constraints written down before investing.",
                you: plan ? "written (with Claude)" : hasPlan ? "written" : "none", s: effHasPlan ? "ok" : "act",
            },
            {
                rule: "Peace-of-mind buffer", bar: "6–9 months of essential costs in zero-risk cash — the calm end of the barbell.",
                you: d.bufferMonths.toFixed(1) + " mo", s: d.bufferMonths >= 6 ? "ok" : d.bufferMonths >= 3 ? "watch" : "act",
            },
            {
                rule: "Ballast in the mix", bar: "Not 100% equities: cash and bonds temper a ~-50% equity drawdown.",
                you: pct(d.ballastShare) + " of liquid", s: d.ballastShare >= 0.2 ? "ok" : d.ballastShare >= 0.1 ? "watch" : "act",
            },
            {
                rule: "Broad low-cost core", bar: "Regular purchases of broad index ETFs before single stocks.",
                you: pct(coreShare) + " index", s: coreShare >= 0.6 ? "ok" : coreShare >= 0.4 ? "watch" : "act",
            },
            {
                rule: "No name can hurt you", bar: "He spreads ~60 names so no single dividend cut matters — a single position stays a few %.",
                you: d.largestSingle.amountEur > 0 ? `${pct(largestShare)} (${d.largestSingle.name})` : "no singles",
                s: largestShare <= 0.05 ? "ok" : largestShare <= 0.10 ? "watch" : "act",
            },
            {
                rule: "Baltic exposure", bar: "Largely exited Nasdaq Baltic — adequate, growing dividend policies are scarce there.",
                you: pct(balticShare), s: balticShare <= 0.10 ? "ok" : balticShare <= 0.25 ? "watch" : "act",
            },
            {
                rule: "Speculation quarantined", bar: "Crypto, punts and play money capped at ~10–15% of liquid assets.",
                you: pct(d.specShare), s: d.specShare <= 0.15 ? "ok" : d.specShare <= 0.20 ? "watch" : "act",
            },
        ];
    }, [d, hasPlan, effHasPlan, plan]);

    const saareRows = useMemo(() => {
        const coreShare = d.share(d.buckets.index);
        const usShare = d.share(d.usGlobal);
        const balticShare = d.share(d.baltic);
        const playShare = d.liquid > 0 ? playEur / d.liquid : 0;
        const investShare = income > 0 ? d.invest / income : 0;
        return [
            {
                rule: "Strategy written down", bar: "Write it down and set rules — discipline through swings beats theory.",
                you: plan ? "written (with Claude)" : hasPlan ? "written" : "none", s: effHasPlan ? "ok" : "act",
            },
            {
                rule: "Pay yourself first", bar: "Investing happens before spending; if nothing is left, it's an income problem.",
                you: `${eur(d.invest)}/mo (${pct(investShare)})`,
                s: d.invest > 0 && investShare >= 0.15 ? "ok" : d.invest > 0 ? "watch" : "act",
            },
            {
                rule: "Income lever in motion", bar: "Past a point, raising income compounds far faster than cutting costs.",
                you: extraIncome > 0 ? `+${eur(extraIncome)}/mo planned` : "nothing planned",
                s: extraIncome > 0 ? "ok" : "watch",
            },
            {
                rule: "Index funds are the core", bar: "Broad funds do the compounding; picks stay small and separate.",
                you: pct(coreShare) + " index", s: coreShare >= 0.6 ? "ok" : coreShare >= 0.4 ? "watch" : "act",
            },
            {
                rule: "US-heavy, home market small", bar: "She keeps Europe and the Baltics small; the core rides the US market.",
                you: `${pct(usShare)} US/global · ${pct(balticShare)} Baltic`,
                s: usShare >= 0.5 && balticShare <= 0.15 ? "ok" : balticShare <= 0.3 ? "watch" : "act",
            },
            {
                rule: "Liquidity as the safety net", bar: "A liquid portfolio + stable income can stand in for a big cash buffer — once it's big enough.",
                you: d.liquidMonths.toFixed(1) + " mo liquid", s: d.liquidMonths >= 6 ? "ok" : d.liquidMonths >= 3 ? "watch" : "act",
            },
            {
                rule: "Play money stays play-sized", bar: "The options pocket is a hobby line, not a strategy.",
                you: pct(playShare), s: playShare <= 0.10 ? "ok" : playShare <= 0.15 ? "watch" : "act",
            },
        ];
    }, [d, hasPlan, effHasPlan, plan, extraIncome, playEur, income]);

    // shared editor for the holdings list
    const updHolding = (i, field, v) =>
        setHoldings(holdings.map((h, j) => (j === i ? { ...h, [field]: v } : h)));
    const addHolding = () =>
        setHoldings([...holdings, { name: "", type: "index_fund", region: "global", amountEur: 0 }]);
    const removeHolding = (i) => setHoldings(holdings.filter((_, j) => j !== i));

    const HoldingsEditor = (
        <div>
            {draftFrom && (
                <div style={{
                    fontSize: 12.5, background: "#f3f0e7", border: `1px solid ${T.baseline}`, borderRadius: 8,
                    padding: "8px 12px", marginBottom: 10, color: T.inkSoft,
                }}>
                    You're looking at the <b>{LENSES[draftFrom].name}-style draft</b> — it is not saved.
                    Hit <b>Save portfolio</b> to adopt it, or <b>Restore saved</b> to go back to your own.
                </div>
            )}
            {holdings.map((h, i) => {
                const basis = Number(h.costBasisEur) || 0;
                const gain = basis > 0 ? (Number(h.amountEur) || 0) / basis - 1 : null;
                return (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{ width: 8, height: 30, borderRadius: 3, background: layerOf(h) === "core" ? T.core : T.satellite }} />
                        <input
                            type="text" value={h.name} placeholder="Name (e.g. iShares Core S&P 500)"
                            onChange={(e) => updHolding(i, "name", e.target.value)}
                            style={{ flex: "1 1 180px", fontSize: 13, padding: "7px 9px", border: `1px solid ${T.baseline}`, borderRadius: 6 }}
                        />
                        <input
                            type="text" value={h.ticker ?? ""} placeholder="Ticker"
                            title="Yahoo Finance symbol (e.g. SXR8.DE, TSM1T.TL) — needed for live prices"
                            onChange={(e) => updHolding(i, "ticker", e.target.value)}
                            style={{ width: 84, fontSize: 12.5, fontFamily: T.mono, padding: "7px 8px", border: `1px solid ${T.baseline}`, borderRadius: 6 }}
                        />
                        <select value={h.type} onChange={(e) => updHolding(i, "type", e.target.value)} style={selStyle} aria-label="asset type">
                            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                        </select>
                        <select value={h.region} onChange={(e) => updHolding(i, "region", e.target.value)} style={selStyle} aria-label="region">
                            {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
                        </select>
                        <MoneyInput value={h.amountEur} onChange={(v) => updHolding(i, "amountEur", v)} step={100} />
                        {gain !== null && Math.abs(gain) >= 0.0005 && (
                            <span title={`vs cost basis ${eur(basis)}`} style={{
                                fontFamily: T.mono, fontSize: 11.5, fontWeight: 700,
                                color: gain >= 0 ? T.ok : T.act, whiteSpace: "nowrap",
                            }}>{gain >= 0 ? "+" : ""}{(gain * 100).toFixed(1)}%</span>
                        )}
                        <button onClick={() => removeHolding(i)} title="Remove" style={{
                            border: `1px solid ${T.line}`, background: "none", borderRadius: 6, padding: "6px 10px",
                            cursor: "pointer", color: T.act, fontWeight: 700,
                        }}>✕</button>
                    </div>
                );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={addHolding} style={{
                    border: `1.5px dashed ${T.baseline}`, background: "none", borderRadius: 8, padding: "8px 16px",
                    cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.inkSoft,
                }}>+ Add asset</button>
                <button onClick={saveHoldings} style={{
                    border: "none", background: T.ink, color: "#fff", borderRadius: 8, padding: "9px 18px",
                    cursor: "pointer", fontSize: 13, fontWeight: 700,
                }}>Save portfolio</button>
                <button onClick={refreshPrices} title="Fetch current prices from Yahoo Finance for every holding with a ticker" style={{
                    border: `1px solid ${T.baseline}`, background: "none", borderRadius: 8, padding: "8px 16px",
                    cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.ink,
                }}>↻ Refresh prices</button>
                {priceMsg && <span style={{ fontSize: 12, color: T.inkSoft }}>{priceMsg}</span>}
                {draftFrom && (
                    <button onClick={() => { fetchHoldings(); setDraftFrom(null); setSaveState(""); }} style={{
                        border: `1px solid ${T.baseline}`, background: "none", borderRadius: 8, padding: "8px 16px",
                        cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.inkSoft,
                    }}>Restore saved</button>
                )}
                {saveState === "saved" && <span style={{ fontSize: 12, color: T.ok, fontWeight: 600 }}>✓ Saved — Claude sees the same file</span>}
                {saveState === "saving" && <span style={{ fontSize: 12, color: T.inkSoft }}>Saving…</span>}
                {saveState === "error" && <span style={{ fontSize: 12, color: T.act, fontWeight: 600 }}>Save failed — is a name empty?</span>}
            </div>
        </div>
    );

    // wizard stepper and navigation buttons
    const Stepper = (
        <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
            {STEPS.map((s, i) => (
                <button key={i} onClick={() => step > i && setStep(i)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 99,
                    border: `1.5px solid ${i === step ? T.ink : T.line}`,
                    background: i < step ? T.ink : "transparent",
                    color: i < step ? "#fff" : i === step ? T.ink : T.muted,
                    fontSize: 12.5, fontWeight: 600, cursor: step > i ? "pointer" : "default", fontFamily: T.sans,
                }}>
                    <span style={{
                        width: 18, height: 18, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center",
                        background: i <= step ? (i < step ? "#fff" : T.ink) : T.line,
                        color: i < step ? T.ink : i === step ? "#fff" : T.muted, fontSize: 11, fontWeight: 700,
                    }}>{i < step ? "✓" : i + 1}</span>
                    {s.title}
                </button>
            ))}
        </div>
    );

    const NavButtons = () => (
        <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            {step > 0 && (
                <button onClick={() => setStep(step - 1)} style={{
                    border: `1px solid ${T.baseline}`, background: "none", borderRadius: 8, padding: "10px 20px",
                    cursor: "pointer", fontSize: 14, fontWeight: 600, color: T.inkSoft,
                }}>← Back</button>
            )}
            <button onClick={next} style={{
                border: "none", background: T.ink, color: "#fff", borderRadius: 8, padding: "10px 26px",
                cursor: "pointer", fontSize: 14, fontWeight: 700,
            }}>{step === 3 ? "Show my dashboard →" : "Next →"}</button>
        </div>
    );

    const wizardBody = () => {
        switch (step) {
            case 0: return (
                <>
                    <Field label="Net monthly income" why="Everything starts from the flow: what actually lands on the account each month.">
                        <RangeWithValue value={income} onChange={set("income")} min={500} max={8000} accent={T.lever} />
                    </Field>
                    <Field label="Living costs, excluding housing" why="Groceries, transport, subscriptions — the essentials that continue even if income stops.">
                        <RangeWithValue value={expenses} onChange={set("expenses")} min={300} max={4000} />
                    </Field>
                    <Field label="Housing payment (mortgage or rent)" why="Kept separate because it is usually the largest fixed cost and behaves differently — a mortgage also builds the home-equity layer.">
                        <RangeWithValue value={housingPmt} onChange={set("housingPmt")} min={0} max={2500} accent={T.home} />
                    </Field>
                    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 8, padding: "12px 16px", maxWidth: 560, fontSize: 13.5 }}>
                        Free cash each month: <Num color={d.freeCash >= 0 ? T.ok : T.act} size={17}>{eur(d.freeCash)}</Num>
                        <span style={{ color: T.inkSoft }}> — this is the raw material for every decision in step 4.</span>
                    </div>
                </>
            );
            case 1: return (
                <>
                    <Field label="Emergency buffer (cash, instantly available)"
                        why={<>Kress's barbell: 6–9 months of essential costs in zero-risk cash before anything speculative. Your essentials are {eur(d.essentials)}/mo, so 6 months = <b>{eur(d.essentials * 6)}</b>. Saare's counter-view: once the liquid portfolio is large and income stable, the buffer can be a design choice.</>}>
                        <RangeWithValue value={bufferEur} onChange={set("bufferEur")} min={0} max={30000} step={250} accent={T.buffer} />
                    </Field>
                    <Field label="Home equity (your share of your home's value)"
                        why="Market value minus remaining loan. It stabilizes net worth but produces no cash flow — both investors treat the home as shelter, not portfolio. Set 0 if renting.">
                        <RangeWithValue value={homeEquity} onChange={set("homeEquity")} min={0} max={200000} step={1000} accent={T.home} />
                    </Field>
                </>
            );
            case 2: return (
                <>
                    <p style={{ fontSize: 13.5, color: T.inkSoft, maxWidth: 620, lineHeight: 1.55, marginTop: 0 }}>
                        List what you own. This saves to <code style={{ fontFamily: T.mono, fontSize: 12 }}>data/portfolio.json</code> in the project —
                        the same file the MCP server exposes to Claude, so Claude can analyze exactly what you enter here.
                        Add a Yahoo Finance ticker (e.g. <code style={{ fontFamily: T.mono, fontSize: 12 }}>SXR8.DE</code>, <code style={{ fontFamily: T.mono, fontSize: 12 }}>TSM1T.TL</code>) to track live prices and earnings.
                        Index funds form your <b style={{ color: "#0d7a55" }}>core</b>; everything else is the <b style={{ color: "#9a6a00" }}>satellite</b>.
                    </p>
                    {HoldingsEditor}
                </>
            );
            case 3: return (
                <>
                    <Field label={`How much of your ${eur(Math.max(0, d.freeCash))} free cash goes to investing each month?`}
                        why="The core decision. Anything not deliberately allocated tends to evaporate into lifestyle. Unallocated remainder shows up as 'slack' on your dashboard.">
                        <RangeWithValue value={investEur} onChange={set("investEur")} min={0} max={Math.max(0, d.freeCash)} accent={T.core} />
                    </Field>
                    <Field label="Planned income increase (€/month)"
                        why="Saare's income lever: past a point, raising income grows the portfolio far faster than cutting costs ever could. Enter a raise, a side income, or a job switch you intend to pursue — the dashboard prices what it is worth over 10 years. Leave 0 to skip.">
                        <RangeWithValue value={extraIncome} onChange={set("extraIncome")} min={0} max={3000} accent={T.lever} />
                    </Field>
                    <Field label="Play money pocket (current value)"
                        why="Kress quarantines speculation — single-stock bets, crypto punts, options — into a pocket capped at 10–15% of liquid assets, so gambling urges never touch the long-term core. Set 0 if you don't speculate.">
                        <RangeWithValue value={playEur} onChange={set("playEur")} min={0} max={10000} step={100} accent={T.play} />
                    </Field>
                    <Field label="Expected annual return"
                        why="7% is a common long-run assumption for global equities before inflation. This only feeds the projection — it is not a promise.">
                        <RangeWithValue value={annualReturn} onChange={set("annualReturn")} min={3} max={10} step={0.5} format={(v) => v + " %"} accent={T.core} />
                    </Field>
                    <Field label="Do you have a written investment plan?"
                        why="Both investors' first rule. Kress calls it the investment declaration — goal, horizon, allocation, constraints; Saare says write the strategy down so discipline survives the swings. It's the first row of both scorecards.">
                        {plan ? (
                            <div style={{ fontSize: 13.5, color: T.ok, fontWeight: 600 }}>
                                ✓ Found — you wrote one with Claude (saved in data/investment-plan.json). This answers itself.
                            </div>
                        ) : (
                            <div style={{ display: "flex", gap: 8 }}>
                                {[["Yes", true], ["Not yet", false]].map(([label, v]) => (
                                    <button key={label} onClick={() => set("hasPlan")(v)} style={{
                                        padding: "8px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                                        border: `1.5px solid ${hasPlan === v ? T.ink : T.line}`,
                                        background: hasPlan === v ? T.ink : "transparent",
                                        color: hasPlan === v ? "#fff" : T.ink, fontFamily: T.sans,
                                    }}>{label}</button>
                                ))}
                            </div>
                        )}
                    </Field>
                </>
            );
            default: return null;
        }
    };

    if (step < 4) {
        return (
            <div style={{ background: T.paper, minHeight: "100vh", padding: "36px 20px", fontFamily: T.sans, color: T.ink }}>
                <div style={{ maxWidth: 760, margin: "0 auto" }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 700, marginBottom: 14 }}>
                        Personal money system · setup
                    </div>
                    {Stepper}
                    <Card>
                        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>{STEPS[step].title}</h1>
                        <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 22px" }}>{STEPS[step].q}</p>
                        {wizardBody()}
                        <NavButtons />
                    </Card>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 14, lineHeight: 1.5 }}>
                        Answers stay on this machine: portfolio in the project's data/portfolio.json, the rest in your browser.
                        You can revisit any step later from the dashboard.
                    </div>
                </div>
            </div>
        );
    }

    // DASHBOARD
    const flow = [
        { label: "Living costs", v: expenses, color: T.context },
        { label: "Housing", v: housingPmt, color: T.home },
        { label: "Investing", v: d.invest, color: T.core },
        { label: "Slack", v: d.slack, color: T.line },
    ];
    const flowTotal = Math.max(income, d.essentials);

    const layers = [
        { key: "buffer", label: "Emergency buffer", v: bufferEur, color: T.buffer, note: `${d.bufferMonths.toFixed(1)} months of costs` },
        { key: "home", label: "Home equity", v: homeEquity, color: T.home, note: "shelter, not cash flow" },
        { key: "core", label: "Index core", v: d.core, color: T.core, note: "broad funds" },
        { key: "satellite", label: "Satellite", v: d.satellite, color: T.satellite, note: "single names & other" },
        { key: "play", label: "Play money", v: playEur, color: T.play, note: "capped speculation" },
    ];
    const layerMax = Math.max(...layers.map((x) => x.v), 1);

    const model = MODELS[lens];
    const modelRows = Object.entries(model.targets).map(([k, target]) => {
        const youShare = d.share(d.buckets[k]);
        const deltaEur = (target - youShare) * d.invested;
        return { k, label: BUCKET_LABEL[k], youShare, target, deltaEur };
    });
    const tryModel = () => {
        const total = Math.max(d.invested, 1000);
        setHoldings(model.build(total));
        setDraftFrom(lens);
        setSaveState("");
    };

    const postCrashBufferMonths = d.essentials > 0 ? Math.max(0, d.postCrashLiquid) / d.essentials : 0;

    return (
        <div style={{ background: T.paper, minHeight: "100vh", padding: "28px 20px", fontFamily: T.sans, color: T.ink }}>
            <div style={{ maxWidth: 1060, margin: "0 auto" }}>

                {/* header */}
                <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 700 }}>
                            Personal money system
                        </div>
                        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 0", letterSpacing: "-0.02em" }}>
                            Your system, from your answers
                        </h1>
                    </div>
                    <button onClick={() => setStep(0)} style={{
                        border: `1px solid ${T.baseline}`, background: T.card, borderRadius: 8, padding: "9px 18px",
                        cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.ink,
                    }}>↺ Redo the questions</button>
                </div>

                {/* KPI row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                    <StatTile label="Net worth" value={eur(d.netWorth)} note="all layers combined" />
                    <StatTile label="Free cash" value={eur(d.freeCash) + "/mo"} note="income − costs" color={d.freeCash >= 0 ? T.ink : T.act} />
                    <StatTile label="Savings rate" value={(d.savingsRate * 100).toFixed(0) + " %"} note="of net income" />
                    <StatTile label="Buffer" value={d.bufferMonths.toFixed(1) + " mo"} note="of essential costs" color={d.bufferMonths >= 6 ? T.ink : T.act} />
                    <StatTile label="Portfolio return"
                        value={d.earningsPct === null ? "—" : `${d.earningsPct >= 0 ? "+" : ""}${(d.earningsPct * 100).toFixed(1)} %`}
                        note={d.earningsPct === null ? "add tickers & refresh prices" : `${eur(d.basisCur - d.basisCost)} vs cost basis`}
                        color={d.earningsPct === null ? T.muted : d.earningsPct >= 0 ? T.ok : T.act} />
                </div>

                {/* pipeline */}
                <Card title="The monthly pipeline" sub="Where each earned euro goes, per your answers." onEdit={() => setStep(0)} style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 130 }}>
                            <div style={{ fontSize: 12, color: T.inkSoft }}>Income</div>
                            <Num size={22} color={T.lever}>{eur(income)}</Num>
                            {extraIncome > 0 && <div style={{ fontSize: 11, color: T.inkSoft }}>+{eur(extraIncome)} planned</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 280 }}>
                            <div style={{ display: "flex", height: 46, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.line}`, background: T.card, gap: 2 }}>
                                {flow.filter((s) => s.v > 0).map((s) => (
                                    <div key={s.label} title={`${s.label}: ${eur(s.v)}`} style={{
                                        width: `${(s.v / flowTotal) * 100}%`, background: s.color,
                                        transition: "width 300ms ease", minWidth: 4, borderRadius: 3,
                                    }} />
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                                {flow.map((s) => (
                                    <div key={s.label} style={{ fontSize: 12, color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: "inline-block", border: `1px solid ${T.line}` }} />
                                        {s.label} <Num size={12}>{eur(s.v)}</Num>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* stability stack + holdings */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
                    <Card title="Stability stack" sub="The layers of the system, foundation first." onEdit={() => setStep(1)}>
                        {layers.map((l) => (
                            <div key={l.key} style={{ marginBottom: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                                    <span style={{ fontWeight: 600 }}>{l.label} <span style={{ color: T.inkSoft, fontWeight: 400 }}>· {l.note}</span></span>
                                    <Num>{eur(l.v)}</Num>
                                </div>
                                <div style={{ height: 12, background: T.paper, borderRadius: 6, overflow: "hidden" }}>
                                    <div style={{ width: `${(l.v / layerMax) * 100}%`, height: "100%", background: l.color, transition: "width 300ms ease" }} />
                                </div>
                            </div>
                        ))}
                    </Card>

                    <Card title="Invested assets" sub="Saved to the same file Claude reads via MCP." onEdit={() => setStep(2)}>
                        {holdings.length === 0 && <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 8 }}>No assets yet — add your first below.</div>}
                        {HoldingsEditor}
                    </Card>
                </div>

                {/* portfolio risk */}
                <Card title="Portfolio risk" sub="A rough 2008-style stress test plus the four exposures both investors manage first. Play with the assets above — this updates live." style={{ marginTop: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
                        <div>
                            <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 2 }}>If markets fall like 2008, your liquid assets…</div>
                            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em" }}>
                                {eur(d.liquid)} <span style={{ color: T.muted, fontWeight: 400 }}>→</span> <span style={{ color: d.crashPct > 0.4 ? T.act : T.ink }}>{eur(d.postCrashLiquid)}</span>
                            </div>
                            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4, lineHeight: 1.5 }}>
                                A <Num color={d.crashPct > 0.4 ? T.act : T.watch}>−{pct(d.crashPct)}</Num> hit ({eur(d.crashLoss)}), weighted by asset type
                                (equities ~−50%, REITs ~−60%, crypto ~−80%, bonds ~−10%, cash 0%).
                                What remains still covers <Num>{postCrashBufferMonths.toFixed(1)}</Num> months of essential costs.
                                Kress's question isn't <i>if</i> this happens but whether the structure lets you sit through it.
                            </div>
                        </div>
                        <div>
                            <Meter label="Equity exposure" value={d.equityShare} watchAt={0.8} actAt={0.95}
                                note="of liquid assets riding the stock market" />
                            <Meter label="Largest single name" value={d.share(Number(d.largestSingle.amountEur) || 0)} watchAt={0.05} actAt={0.10}
                                note={d.largestSingle.amountEur > 0 ? d.largestSingle.name : "no single names"} />
                            <Meter label="Baltic home bias" value={d.share(d.baltic)} watchAt={0.10} actAt={0.25}
                                note="small, illiquid, sector-concentrated market" />
                            <Meter label="Speculation" value={d.specShare} watchAt={0.10} actAt={0.15}
                                note="crypto, commodities, play money — Kress's 10–15% fence" />
                        </div>
                    </div>
                </Card>

                {/* a good portfolio, their way */}
                <Card title="A good portfolio, their way"
                    sub="What each investor's published principles imply for your invested amount — compare, then try the mix in the editor." style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        {Object.entries(LENSES).map(([k, l]) => (
                            <button key={k} onClick={() => setLens(k)} style={{
                                padding: "7px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer",
                                border: `1.5px solid ${lens === k ? T.ink : T.line}`,
                                background: lens === k ? T.ink : "transparent",
                                color: lens === k ? "#fff" : T.ink,
                            }}>{l.name}-style</button>
                        ))}
                    </div>
                    <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.5, maxWidth: 720 }}>{model.blurb}</p>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 720 }}>
                            <thead>
                                <tr>
                                    <th style={th}>Bucket</th>
                                    <th style={th}>You</th>
                                    <th style={th}>Target</th>
                                    <th style={th}>To get there</th>
                                </tr>
                            </thead>
                            <tbody>
                                {modelRows.map((r) => (
                                    <tr key={r.k}>
                                        <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                                        <td style={{ ...td, fontFamily: T.mono }}>{pct(r.youShare)}</td>
                                        <td style={{ ...td, fontFamily: T.mono }}>{pct(r.target)}</td>
                                        <td style={{ ...td, fontFamily: T.mono, color: Math.abs(r.deltaEur) < 50 ? T.ok : r.deltaEur > 0 ? T.inkSoft : T.watch, whiteSpace: "nowrap" }}>
                                            {Math.abs(r.deltaEur) < 50 ? "✓ on target" : `${r.deltaEur > 0 ? "+" : "−"}${eur(Math.abs(r.deltaEur))}`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 10, lineHeight: 1.5, maxWidth: 720 }}>{model.caveat}</div>
                    <button onClick={tryModel} style={{
                        marginTop: 12, border: "none", background: T.ink, color: "#fff", borderRadius: 8,
                        padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700,
                    }}>Load this mix into the editor (as a draft)</button>
                    <span style={{ fontSize: 12, color: T.muted, marginLeft: 10 }}>
                        Replaces the asset list above with a {LENSES[lens].name}-style mix scaled to {eur(Math.max(d.invested, 1000))} — nothing is saved until you say so.
                    </span>
                </Card>

                {/* the two scorecards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 16, marginTop: 16 }}>
                    <Card title="Kress's scorecard" sub="Your system + portfolio against Märten Kress's published principles.">
                        <ScoreTable rows={kressRows} />
                    </Card>
                    <Card title="Saare's scorecard" sub="The same system through Kristi Saare's published principles.">
                        <ScoreTable rows={saareRows} />
                    </Card>
                </div>

                {/* investment declaration */}
                <Card title="Your investment declaration"
                    sub={plan
                        ? `Written with Claude's guided interview · last updated ${new Date(plan.updatedAt).toLocaleDateString("et-EE")}. Kress's rule: on the -40% day, decisions follow this document, not the mood.`
                        : "Not written yet — both investors' first rule."}
                    style={{ marginTop: 16 }}>
                    {plan ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "4px 24px" }}>
                            {Object.entries(PLAN_TITLES).map(([key, title]) =>
                                plan.sections[key] ? (
                                    <div key={key} style={{ padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                                        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, fontWeight: 700, marginBottom: 2 }}>{title}</div>
                                        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{plan.sections[key]}</div>
                                    </div>
                                ) : null,
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
                            Open a terminal, run <code style={{ fontFamily: T.mono, fontSize: 12.5, background: T.paper, padding: "2px 6px", borderRadius: 4 }}>claude</code> and
                            say <i>"Help me write my investment plan"</i>. Claude runs a guided interview — one question at a time, each grounded in
                            Kress's and Saare's published principles — and saves the result here. It also flips the "written plan" rows above to pass.
                        </div>
                    )}
                </Card>

                {/* projection */}
                <Card
                    title="What the income lever is worth"
                    sub={`Both lines invest ${eur(d.invest)}/mo at ${annualReturn}%. The amber line assumes you also secure the planned +${eur(extraIncome)}/mo income increase and invest all of it.`}
                    onEdit={() => setStep(3)} style={{ marginTop: 16 }}>
                    <div style={{ height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={projection} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                                <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="year" tick={{ fontSize: 12, fontFamily: T.mono, fill: T.muted }} stroke={T.baseline}
                                    label={{ value: "years", position: "insideBottomRight", offset: -2, fontSize: 11, fill: T.muted }} />
                                <YAxis tick={{ fontSize: 12, fontFamily: T.mono, fill: T.muted }} stroke={T.baseline}
                                    tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                                <Tooltip formatter={(v) => eur(v)} labelFormatter={(y) => `Year ${y}`}
                                    contentStyle={{ borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 13 }} />
                                <Legend wrapperStyle={{ fontSize: 13 }} />
                                <ReferenceLine x={10} stroke={T.baseline} strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="base" name="Current plan" stroke={T.context} strokeWidth={2} dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="lever" name="With income lever" stroke={T.lever} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                        {extraIncome > 0 ? (
                            <>At the 10-year mark the income lever is worth <Num color={T.lever}>{eur(leverGain)}</Num> extra —
                                Saare's point made visible: an income increase, invested, compounds harder than any expense cut could.</>
                        ) : (
                            <>You haven't planned an income increase yet. Set one in step 4 to see Saare's core argument:
                                raising income beats squeezing the budget once savings hit a wall.</>
                        )}
                    </div>
                </Card>

                {/* mindset */}
                <Card title="Reference mindsets" sub="Paraphrased from public writing and interviews — not advice." style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                        {Object.entries(LENSES).map(([k, l]) => (
                            <button key={k} onClick={() => setLens(k)} style={{
                                padding: "7px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer",
                                border: `1.5px solid ${lens === k ? T.ink : T.line}`,
                                background: lens === k ? T.ink : "transparent",
                                color: lens === k ? "#fff" : T.ink,
                            }}>{l.name}</button>
                        ))}
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>{LENSES[lens].tag}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0 24px" }}>
                        {LENSES[lens].mindset.map((m, i) => (
                            <div key={i} style={{ fontSize: 13, lineHeight: 1.55, padding: "7px 0 7px 12px", borderLeft: `3px solid ${LENSES[lens].color}`, marginBottom: 6 }}>
                                {m}
                            </div>
                        ))}
                    </div>
                </Card>

                <div style={{ fontSize: 11, color: T.muted, marginTop: 18, lineHeight: 1.5 }}>
                    Built on paraphrased public statements by Märten Kress and Kristi Saare — not investment advice; the model mixes and pass/fail bars are a plausible translation of their public principles, not their actual recommendations. Stress-test drawdowns are rough historical orders of magnitude.
                    Your portfolio lives in the project's data/portfolio.json; ask Claude (with the portfolio MCP connected) to analyze or update it — you'll see changes here on refresh. Live prices come from Yahoo Finance via ↻ Refresh prices or Claude's refresh_prices tool.
                </div>
            </div>
        </div>
    );
}
