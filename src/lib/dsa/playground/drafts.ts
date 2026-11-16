/**
 * The Playground's drafts: one per language, saved as you type. Stored the way the reading look and saved problems are
 * (no table, no schema change): this browser's localStorage always, and for a signed-in learner also the account's
 * game flags (user_profiles.game_flags via src/game, key `pref:dsa-pg:<lang>`). `pref:` keys carry `updatedAt`, so the
 * newer copy wins when two devices meet (src/lib/learn/saved-paths.ts mergeGameFlags).
 *
 * The game flags are one JSON column pushed whole on every change, so a draft syncs to the account only up to
 * DRAFT_SYNC_MAX; a bigger one stays on this device (the Playground says so).
 *
 * "Open in Playground" from a lesson snippet hands its program over through localStorage (INCOMING_KEY): the Playground
 * reads it once, keeps the draft it replaces (PREVIOUS_KEY) so the learner can bring it back, and clears the hand-off.
 *
 * Pure (type imports only).
 */
import type { DsaLang } from "../types";

export const DRAFT_FLAG_PREFIX = "pref:dsa-pg:";
export const DRAFT_LOCAL_PREFIX = "dsa.pg.draft.";
export const LANG_LOCAL_KEY = "dsa.pg.lang";
export const INCOMING_KEY = "dsa.pg.incoming";
export const PREVIOUS_PREFIX = "dsa.pg.previous.";
/** characters of code + input a draft may have and still follow the account */
export const DRAFT_SYNC_MAX = 16_000;

export type Draft = { code: string; stdin: string; updatedAt: number };
export type Incoming = { lang: DsaLang; code: string; stdin: string; from?: { title: string; href: string }; at: number };

export const draftFlagKey = (l: DsaLang) => `${DRAFT_FLAG_PREFIX}${l}`;
export const draftLocalKey = (l: DsaLang) => `${DRAFT_LOCAL_PREFIX}${l}`;
export const previousLocalKey = (l: DsaLang) => `${PREVIOUS_PREFIX}${l}`;

const LANGS: DsaLang[] = ["python", "javascript", "java", "cpp"];
export const isLang = (v: unknown): v is DsaLang => typeof v === "string" && (LANGS as string[]).includes(v);

/** A stored value → a draft, or null when it isn't one. */
export function decodeDraft(v: unknown): Draft | null {
  let o = v;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const d = o as Record<string, unknown>;
  if (typeof d.code !== "string") return null;
  return { code: d.code, stdin: typeof d.stdin === "string" ? d.stdin : "", updatedAt: Number(d.updatedAt) || 0 };
}

/** Small enough to follow the account (the game flags)? */
export const fitsAccount = (d: Pick<Draft, "code" | "stdin">) => d.code.length + d.stdin.length <= DRAFT_SYNC_MAX;

/** The newer of two drafts (either may be missing). */
export function newerDraft(a: Draft | null, b: Draft | null): Draft | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/** The hand-off a lesson snippet left, if it is fresh (ten minutes) and well formed. */
export function decodeIncoming(raw: string | null, now = Date.now()): Incoming | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Incoming>;
    if (!isLang(o.lang) || typeof o.code !== "string" || typeof o.at !== "number" || now - o.at > 10 * 60_000) return null;
    const from = o.from && typeof o.from.title === "string" && typeof o.from.href === "string" && o.from.href.startsWith("/") ? { title: o.from.title.slice(0, 160), href: o.from.href.slice(0, 300) } : undefined;
    return { lang: o.lang, code: o.code, stdin: typeof o.stdin === "string" ? o.stdin : "", from, at: o.at };
  } catch {
    return null;
  }
}

/** The program a language starts with: reads two numbers from stdin and prints their sum, so Run shows input at work. */
export const STARTERS: Record<DsaLang, { code: string; stdin: string }> = {
  python: {
    code: `import sys


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = list(map(int, data[1:1 + n]))
    print(sum(nums))


main()
`,
    stdin: "5\n3 1 2 -2 4\n",
  },
  javascript: {
    code: `const data = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);
const n = data[0];
const nums = data.slice(1, 1 + n);
console.log(nums.reduce((a, b) => a + b, 0));
`,
    stdin: "5\n3 1 2 -2 4\n",
  },
  java: {
    code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        long total = 0;
        for (int i = 0; i < n; i++) total += in.nextLong();
        System.out.println(total);
    }
}
`,
    stdin: "5\n3 1 2 -2 4\n",
  },
  cpp: {
    code: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    long long total = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        total += x;
    }
    cout << total << "\\n";
    return 0;
}
`,
    stdin: "5\n3 1 2 -2 4\n",
  },
};

/** The file name a draft shows as in the list ("main.py", "Main.java"…). */
export const FILE_NAME: Record<DsaLang, string> = { python: "main.py", javascript: "main.js", java: "Main.java", cpp: "main.cpp" };

/** "just now", "5 min ago", "2 h ago", "3 days ago" */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
