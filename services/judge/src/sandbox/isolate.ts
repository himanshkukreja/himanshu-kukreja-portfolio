// isolate 2.x (cgroup v2) sandbox: the production path, also used for local
// tests inside Docker Desktop (privileged container, private cgroup namespace).
//
// Every run gets: a fresh mount namespace with read-only /usr, /bin, /lib; a
// private /tmp; an empty network namespace (loopback only); a per-box
// unprivileged uid/gid (60000 + box id); a cgroup with a memory cap; RLIMITs
// for processes, file size and stack; and isolate's syscall restrictions.

import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Box, RunMeta, RunSpec, Sandbox } from "./types.ts";

const ISOLATE = process.env.JUDGE_ISOLATE_BIN || "/usr/local/bin/isolate";

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exec(args: string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(ISOLATE, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, killSignal: "SIGKILL" }, (err, stdout, stderr) => {
      if (err && typeof (err as NodeJS.ErrnoException).code === "string") {
        reject(new Error(`cannot run isolate: ${err.message}`));
        return;
      }
      const code = err ? ((err as { code?: number }).code ?? -1) : 0;
      if (err && (err as { killed?: boolean }).killed) {
        reject(new Error(`isolate did not finish within ${timeoutMs} ms`));
        return;
      }
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export function parseMeta(text: string): RunMeta {
  const kv = new Map<string, string>();
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const num = (k: string): number | null => (kv.has(k) ? Number(kv.get(k)) : null);
  const status = (kv.get("status") as RunMeta["status"] | undefined) ?? "OK";
  const cgMem = num("cg-mem");
  const rss = num("max-rss");
  return {
    status,
    exitCode: num("exitcode"),
    exitSignal: num("exitsig"),
    timeMs: Math.round((num("time") ?? 0) * 1000),
    wallMs: Math.round((num("time-wall") ?? 0) * 1000),
    memoryKb: cgMem ?? rss ?? 0,
    oomKilled: kv.has("cg-oom-killed"),
    killed: kv.has("killed"),
    message: kv.get("message") ?? "",
  };
}

class IsolateBox implements Box {
  readonly id: number;
  private root = "";
  private readonly metaPath: string;
  constructor(id: number, workDir: string) {
    this.id = id;
    this.metaPath = join(workDir, `meta-${id}.txt`);
  }
  get dir(): string {
    if (!this.root) throw new Error(`box ${this.id} is not initialised`);
    return join(this.root, "box");
  }
  async init(): Promise<void> {
    // A crashed earlier run may have left the box behind; --cleanup is idempotent.
    await exec(["--cg", `--box-id=${this.id}`, "--cleanup"], 30_000);
    const r = await exec(["--cg", `--box-id=${this.id}`, "--init"], 30_000);
    if (r.code !== 0) throw new Error(`isolate --init failed: ${r.stderr.trim()}`);
    this.root = r.stdout.trim();
  }
  async cleanup(): Promise<void> {
    this.root = "";
    await exec(["--cg", `--box-id=${this.id}`, "--cleanup"], 30_000);
  }
  async run(spec: RunSpec): Promise<RunMeta> {
    const args = [
      "--cg",
      `--box-id=${this.id}`,
      `--meta=${this.metaPath}`,
      `--time=${spec.timeSec}`,
      `--wall-time=${spec.wallSec}`,
      `--extra-time=${spec.extraTimeSec ?? 0.2}`,
      `--cg-mem=${Math.floor(spec.memoryKb)}`,
      `--processes=${spec.processes}`,
      `--fsize=${spec.fileSizeKb}`,
      `--open-files=${spec.openFiles ?? 256}`,
      "--silent",
    ];
    if (spec.stackKb) args.push(`--stack=${spec.stackKb}`);
    if (spec.stdin) args.push(`--stdin=${spec.stdin}`);
    args.push(`--stdout=${spec.stdout}`);
    if (spec.stderrToStdout) args.push("--stderr-to-stdout");
    else if (spec.stderr) args.push(`--stderr=${spec.stderr}`);
    for (const [k, v] of Object.entries(spec.env)) args.push(`--env=${k}=${v}`);
    for (const d of spec.dirs ?? []) args.push(`--dir=${d}`);
    args.push("--run", "--", ...spec.cmd);

    await rm(this.metaPath, { force: true });
    const r = await exec(args, Math.ceil(spec.wallSec * 1000) + 15_000);
    if (r.code !== 0 && r.code !== 1) throw new Error(`isolate internal error (exit ${r.code}): ${r.stderr.trim()}`);
    let metaText = "";
    try {
      metaText = await readFile(this.metaPath, "utf8");
    } catch {
      throw new Error(`isolate wrote no meta file: ${r.stderr.trim()}`);
    }
    const meta = parseMeta(metaText);
    if (meta.status === "XX") throw new Error(`isolate internal error: ${meta.message}`);
    return meta;
  }
}

export class IsolateSandbox implements Sandbox {
  readonly name = "isolate";
  private readonly workDir: string;
  constructor(workDir: string) {
    this.workDir = workDir;
  }
  box(id: number): Box {
    return new IsolateBox(id, this.workDir);
  }
  async selfCheck(): Promise<void> {
    const v = await exec(["--version"], 10_000);
    if (v.code !== 0) throw new Error("isolate --version failed");
    // Run a trivial program so a sandbox that can init but not run (missing
    // cgroup delegation, no namespace support under emulation) fails at startup.
    const b = this.box(63);
    await b.init();
    try {
      const meta = await b.run({
        cmd: ["/bin/true"],
        stdout: "__out.txt",
        timeSec: 2,
        wallSec: 5,
        memoryKb: 64 * 1024,
        processes: 4,
        fileSizeKb: 1024,
        env: { PATH: "/usr/bin:/bin" },
      });
      if (meta.status !== "OK") throw new Error(`sandbox self-check failed: ${meta.status} ${meta.message}`);
    } finally {
      await b.cleanup();
    }
  }
}
