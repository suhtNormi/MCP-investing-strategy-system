// Seeds <project>/data/portfolio.json with the current portfolio.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// add your holdings here, example {name: "Amundi Stoxx Europe 600", type: "index_fund", region: "europe", amountEur: 1000}
const holdings = [
    { name: "Amundi Stoxx Europe 600", type: "index_fund", region: "europe", amountEur: 1000 }
];

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "portfolio.json"), JSON.stringify(holdings, null, 2));
console.log(`Seeded ${holdings.length} holdings to ${path.join(dir, "portfolio.json")}`);
