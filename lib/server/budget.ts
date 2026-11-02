import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import type { Allowance } from "../types";
import { replaceFile } from "./files";

// Visitors spend the site owner's Magic Hour credits, so usage is capped per
// UTC day, site-wide and per visitor. The ledger is a small JSON file on the data volume.

type Ledger = { day: string; total: number; visitors: Record<string, number> };

export class BudgetError extends Error {}

const file = () => path.join(env.dataDir, "usage.json");
const today = () => new Date().toISOString().slice(0, 10);

let ledger: Ledger | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Ledger> {
  if (!ledger) {
    try {
      ledger = JSON.parse(await fs.readFile(file(), "utf8"));
    } catch {}
  }
  if (!ledger || ledger.day !== today()) ledger = { day: today(), total: 0, visitors: {} };
  return ledger;
}

async function save(l: Ledger) {
  await fs.mkdir(env.dataDir, { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(l));
  await replaceFile(tmp, file());
}

/** Run read-modify-write steps one at a time so concurrent renders can't overspend. */
function locked<T>(fn: (l: Ledger) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => fn(await load()));
  queue = next.catch(() => {});
  return next;
}

function left(l: Ledger, visitor: string): Allowance | null {
  const site = env.dailyCredits;
  const own = env.visitorDailyCredits;
  if (site === Infinity && own === Infinity) return null;
  return {
    left: Math.max(0, Math.min(site - l.total, own - (l.visitors[visitor] ?? 0))),
    limit: Math.min(site, own),
  };
}

/** Credits this visitor can still spend today, or null when there's no cap. */
export const allowance = (visitor: string) => locked((l) => left(l, visitor));

/** Set aside credits before a job starts. Throws BudgetError when there aren't enough. */
export function reserve(visitor: string, credits: number) {
  return locked(async (l) => {
    const a = left(l, visitor);
    if (a && credits > a.left) {
      throw new BudgetError(
        a.left <= 0
          ? "Today's free lip sync on this site is used up. It resets at midnight UTC."
          : `This needs about ${credits.toLocaleString()} lip sync credits, and ${a.left.toLocaleString()} are left for you today. Re-voice fewer lines, choose "Only the changed words", or try again tomorrow.`
      );
    }
    l.total += credits;
    l.visitors[visitor] = (l.visitors[visitor] ?? 0) + credits;
    await save(l);
  });
}

/** Record credits after the fact. Negative amounts refund an over-reservation. */
export function record(visitor: string, credits: number) {
  if (!credits) return Promise.resolve();
  return locked(async (l) => {
    l.total = Math.max(0, l.total + credits);
    l.visitors[visitor] = Math.max(0, (l.visitors[visitor] ?? 0) + credits);
    await save(l);
  });
}
