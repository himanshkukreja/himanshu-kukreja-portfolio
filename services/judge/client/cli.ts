// Tiny CLI for poking a judge (local or through the tunnel).
//
//   JUDGE_URL=https://judge.example.dev JUDGE_HMAC_SECRET=... [JUDGE_KEY_ID=prod] node client/cli.ts health
//   ... node client/cli.ts judge request.json
//   ... node client/cli.ts run cpp solution.cpp "2 3"     (stdio mode, prints stdout)

import { readFileSync } from "node:fs";
import { callJudge } from "./judge-client.ts";

const env = {
  JUDGE_URL: process.env.JUDGE_URL ?? "http://127.0.0.1:8080",
  JUDGE_HMAC_SECRET: process.env.JUDGE_HMAC_SECRET ?? "",
  JUDGE_KEY_ID: process.env.JUDGE_KEY_ID,
};

async function main(): Promise<void> {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (!env.JUDGE_HMAC_SECRET) throw new Error("set JUDGE_HMAC_SECRET");
  let res;
  if (cmd === "health") {
    res = await callJudge(env, null, { method: "GET", path: "/health" });
  } else if (cmd === "judge" && a) {
    res = await callJudge(env, JSON.parse(readFileSync(a, "utf8")));
  } else if (cmd === "run" && a && b) {
    res = await callJudge(env, { language: a, mode: "stdio", code: readFileSync(b, "utf8"), tests: [{ input: c ?? "" }] });
  } else {
    console.error("usage: cli.ts health | judge <request.json> | run <language> <file> [stdin]");
    process.exit(2);
  }
  console.log(`HTTP ${res.status}${res.retryAfterSec ? ` (retry after ${res.retryAfterSec}s)` : ""}`);
  console.log(JSON.stringify(res.body, null, 2));
  process.exit(res.status === 200 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
