import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Serves and persists the same data the MCP server uses, so the dashboard and
// Claude always look at one source of truth: <project>/data/
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const PORTFOLIO_FILE = path.join(DATA_DIR, "portfolio.json");
const PLAN_FILE = path.join(DATA_DIR, "investment-plan.json");

const TYPES = ["index_fund", "dividend_stock", "growth_stock", "reit", "bond", "crypto", "commodity", "cash", "other"];
const REGIONS = ["global", "usa", "europe", "emerging_markets", "baltics", "nordics", "asia_pacific", "other"];

const isHolding = (h) =>
    h && typeof h === "object" &&
    typeof h.name === "string" && h.name.trim() !== "" &&
    TYPES.includes(h.type) && REGIONS.includes(h.region) &&
    typeof h.amountEur === "number" && Number.isFinite(h.amountEur) && h.amountEur >= 0 &&
    (h.ticker === undefined || typeof h.ticker === "string") &&
    (h.costBasisEur === undefined || (typeof h.costBasisEur === "number" && h.costBasisEur >= 0)) &&
    (h.snapshotPrice === undefined || (typeof h.snapshotPrice === "number" && h.snapshotPrice > 0));

const readPortfolio = () => JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf-8"));
const writePortfolio = (holdings) => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(holdings, null, 2));
};

// Yahoo Finance public chart endpoint — same snapshot-ratio model as the MCP server:
// current value = costBasisEur × currentPrice / snapshotPrice (currency-independent).
async function fetchQuote(ticker) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) return null;
        const json = await res.json();
        const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
        return typeof price === "number" && price > 0 ? price : null;
    } catch {
        return null;
    }
}

const round2 = (n) => Math.round(n * 100) / 100;

const portfolioApi = {
    name: "portfolio-api",
    configureServer(server) {
        server.middlewares.use("/api/portfolio", (req, res) => {
            res.setHeader("Content-Type", "application/json");

            if (req.method === "GET") {
                try {
                    res.end(fs.readFileSync(PORTFOLIO_FILE, "utf-8"));
                } catch {
                    res.statusCode = 404;
                    res.end("[]");
                }
                return;
            }

            if (req.method === "POST") {
                let body = "";
                req.on("data", (chunk) => (body += chunk));
                req.on("end", () => {
                    try {
                        const holdings = JSON.parse(body);
                        if (!Array.isArray(holdings) || !holdings.every(isHolding)) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: "Expected an array of {name, type, region, amountEur, ticker?, costBasisEur?, ...}" }));
                            return;
                        }
                        writePortfolio(holdings);
                        res.end(JSON.stringify({ ok: true, count: holdings.length }));
                    } catch {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: "Invalid JSON" }));
                    }
                });
                return;
            }

            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
        });

        // refresh current values from Yahoo for every holding with a ticker
        server.middlewares.use("/api/refresh-prices", async (req, res) => {
            res.setHeader("Content-Type", "application/json");
            if (req.method !== "POST") {
                res.statusCode = 405;
                res.end(JSON.stringify({ error: "Method not allowed" }));
                return;
            }
            let holdings;
            try {
                holdings = readPortfolio();
            } catch {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "No portfolio yet" }));
                return;
            }
            let updated = 0, initialized = 0, failed = 0;
            for (const h of holdings) {
                if (!h.ticker) continue;
                const price = await fetchQuote(h.ticker);
                if (!price) { failed++; continue; }
                if (!h.snapshotPrice || !h.costBasisEur) {
                    h.costBasisEur = h.costBasisEur ?? h.amountEur;
                    h.snapshotPrice = price;
                    h.snapshotAt = new Date().toISOString();
                    initialized++;
                } else {
                    h.amountEur = round2(h.costBasisEur * (price / h.snapshotPrice));
                    updated++;
                }
            }
            writePortfolio(holdings);
            res.end(JSON.stringify({ holdings, updated, initialized, failed, skippedNoTicker: holdings.filter((h) => !h.ticker).length }));
        });

        // read-only endpoint for the investment plan, which is generated by the MCP server and stored in <project>/data/investment-plan.json
        server.middlewares.use("/api/plan", (_req, res) => {
            res.setHeader("Content-Type", "application/json");
            try {
                res.end(fs.readFileSync(PLAN_FILE, "utf-8"));
            } catch {
                res.statusCode = 404;
                res.end("null");
            }
        });
    },
};

export default defineConfig({
    plugins: [react(), portfolioApi],
});
