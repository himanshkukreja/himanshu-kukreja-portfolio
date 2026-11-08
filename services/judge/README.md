# judge-lite

The server-side code judge for DSA Mastery. It judges **Java and C++** submissions, the languages the browser cannot run. It also judges **Python and JavaScript** for verified re-judges (plan 7.3: every first browser AC is re-run here before it earns points). It is the "judge-lite" option from the plan (sections 7.1, 7.3 and 14.4):

- the IOI [`isolate`](https://github.com/ioi/isolate) sandbox (v2.7, cgroup v2);
- g++ 13, OpenJDK 21, Python 3.12 and Node 22;
- a small dependency-free Node 22 + TypeScript gateway;
- one Lightsail VM in Mumbai, reachable only through a Cloudflare Tunnel.

```
 browser ──> site Worker /api/dsa/judge ── HMAC-signed POST ──> Cloudflare edge
             (sign-in, rate limit 8/min,                            │  Tunnel (outbound-only
              daily cap 300, access)                                │  connection from the VM)
                                                                    ▼
 ┌──────────────────────── Lightsail VM (Ubuntu 24.04, ufw: only 22/tcp in) ────────────────────────┐
 │ cloudflared ──> 127.0.0.1:8080 ──> judge-lite container (privileged, read-only rootfs)           │
 │                                     gateway (Node 22, user "judge")                              │
 │                                       HMAC verify → validate → FIFO queue → worker pool (1/vCPU) │
 │                                       worker N: compile box 2N ──> run box 2N+1 (fresh per test) │
 │                                     isolate (setuid) → namespaces, cgroup v2, uid 60000+box,     │
 │                                       empty netns, read-only /usr, private /tmp                  │
 └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Contents

```
services/judge/
  src/server.ts          HTTP gateway: /judge, /health, /livez
  src/hmac.ts            request signing and verification (+ replay protection)
  src/queue.ts           FIFO queue + worker pool, 503 admission control
  src/judge.ts           compile once, run every test, verdicts
  src/languages.ts       toolchain commands, memory and time factors per language
  src/compare.ts         exact / token / float:eps / unordered comparators
  src/harness/           language-neutral signature -> drivers for C++, Java, Python, JS
  src/sandbox/isolate.ts isolate 2.x wrapper (the only sandbox; see "Sandbox")
  src/testsets.ts        stored test sets: R2 stub + local-dir source + LRU cache
  client/judge-client.ts Worker-side signer and fetch helper (Web Crypto)
  client/cli.ts          poke a judge from a laptop: health, judge <file>, run <lang> <file>
  docker/                isolate config and container entrypoint
  deploy/                VM bootstrap, install script, systemd unit, env example
  test/                  unit tests (node:test) and the Docker integration suite
```

## API

All JSON. Every request except `/livez` must be signed.

### Authentication

The Worker signs each request with a shared secret:

| Header | Value |
|---|---|
| `X-Judge-Key-Id` | key id: `prod` or `staging` (optional; default `default`) |
| `X-Judge-Timestamp` | unix seconds; rejected if more than 60 s from the VM's clock |
| `X-Judge-Nonce` | 16 to 64 chars of `[A-Za-z0-9_-]`, unique per request; replays are rejected |
| `X-Judge-Signature` | `v1=` + hex HMAC-SHA256(secret, canonical) |

```
canonical = "v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + hex(sha256(body))
```

`client/judge-client.ts` implements this with Web Crypto. A Worker can import it, or copy it:

```ts
import { callJudge } from "<repo>/services/judge/client/judge-client";
const r = await callJudge(env, { language: "java", code, mode: "function", signature, tests, limits: { timeMs: 2000 } });
if (r.status === 503) return retryLater(r.retryAfterSec);
```

The Worker uses these env names:

| Name | Kind | Example |
|---|---|---|
| `JUDGE_URL` | var | `https://judge.systemdesignmastery.dev` |
| `JUDGE_HMAC_SECRET` | secret (`wrangler secret put`) | 64 hex chars, from `install-judge.sh` |
| `JUDGE_KEY_ID` | var | `prod` on production, `staging` on the staging Worker |

### `POST /judge`

```jsonc
{
  "submissionId": "sub_123",            // optional, echoed and logged
  "language": "cpp",                    // cpp | java | python | javascript (aliases: c++, cpp17, cpp20, java21, py, js)
  "std": "c++17",                       // cpp only: c++17 (default) | c++20
  "code": "class Solution { ... };",    // at most 64 KB (UTF-8 bytes)
  "mode": "function",                   // function (default) | stdio ("stdin" accepted)
  "signature": {                        // function mode: plan 7.1 format
    "fn": "busiest_stretch",
    "params": [{ "name": "plays", "type": "int[]" }, { "name": "k", "type": "int" }],
    "returns": "long"
  },
  "tests": [                            // inline tests, at most 200 ...
    { "input": [[3, 1, 4, 1, 5], 2], "expected": 9 },
    { "input": { "plays": [5], "k": 1 }, "expected": 5, "hidden": true },
    { "inputText": "[9223372036854775807]\n1", "expectedText": "9223372036854775807", "hidden": true }
  ],
  // ... or a stored test set instead of tests:
  // "testSet": { "problemId": "busiest-stretch", "version": "<content hash>", "sets": ["visible", "hidden"] },
  "limits": { "timeMs": 2000, "memoryMb": 256 },   // clamped to 100..10000 ms, 32..512 MB
  "compare": "exact",                   // exact | token | float:1e-6 | unordered | unordered:deep  ("checker" accepted too)
  "stopOnFirstFailure": true            // default true; later tests are reported as SKIPPED
}
```

How tests are encoded:

- **Function mode.** `input` is the argument list, or an object keyed by param name. `expected` is the return value as JSON. Use `inputText` (one JSON value per line, LeetCode style) and `expectedText` when values must stay exact beyond 2^53 (Java `long`, C++ `long long`).
- **Stdio mode.** `input` is stdin and `expected` is stdout, both plain strings.
- **No `expected`** means "just run" (custom input). The verdict is `OK` and `output` holds the result. For custom input, the Worker runs the reference solution first (plan 7.3) and then the learner's code with that output as `expected`.

Response `200`:

```jsonc
{
  "submissionId": "sub_123",
  "verdict": "WA",                      // AC | WA | TLE | MLE | RE | CE | OLE | OK
  "language": "cpp",
  "compile": { "ok": true, "output": "", "timeMs": 95, "memoryKb": 180000 },  // output trimmed to 8 KB
  "tests": [
    { "id": "1", "verdict": "AC", "timeMs": 1, "memoryKb": 1400, "hidden": false,
      "input": "[[3,1,4,1,5],2]", "expected": "9", "output": "9", "stdout": "debug print", "stderr": "" },
    { "id": "2", "verdict": "WA", "timeMs": 1, "memoryKb": 1300, "hidden": true, "message": "wrong answer" },
    { "id": "3", "verdict": "SKIPPED", "timeMs": 0, "memoryKb": 0, "hidden": true }
  ],
  "summary": { "passed": 1, "total": 3, "run": 2, "maxTimeMs": 1, "maxMemoryKb": 1400 },
  "firstFailure": { "id": "2", "verdict": "WA", "hidden": true, "input": "[[5],1]", "message": "wrong answer" },
  "limits": { "timeMs": 2000, "memoryMb": 256, "cpuLimitMs": 2000, "boxMemoryMb": 256 },
  "judgeMs": 640, "queueMs": 3, "totalMs": 650
}
```

- Hidden tests never return their expected output. The output of a hidden test is also withheld.
- `firstFailure.input` is truncated to 256 characters, even for a hidden test (plan 7.3).
- Visible tests return their input, expected, output, stdout and stderr, each truncated to 4 KB.
- In function mode, `stdout` is the learner's debug printing. It is never compared.

Verdicts:

| Verdict | Meaning |
|---|---|
| `AC` | every test matched |
| `WA` | output differs (`message` says where, without hidden data) |
| `TLE` | CPU time over the limit, or wall time over 2 × limit + 1 s (sleeping) |
| `MLE` | cgroup OOM kill, or the runtime's own OOM (`std::bad_alloc`, `OutOfMemoryError`, `MemoryError`, V8 heap) |
| `RE` | non-zero exit or fatal signal; `message` names it, e.g. `SIGSEGV`, `SIGFPE`, `ArrayIndexOutOfBoundsException (exit code 1)`, `stack overflow` |
| `CE` | compilation (or Python/JS syntax check) failed; see `compile.output` |
| `OLE` | stdout or the returned value is over 1 MB, or a file write hit 16 MB |
| `OK` | ran, no expected output to compare (custom input) |
| `SKIPPED` | not run (after CE, or after the first failure with `stopOnFirstFailure`) |

The overall `verdict` is the first failing test's verdict, otherwise `AC`.

Errors use `{ "error": CODE, "message": "..." }`:

| Status | Codes |
|---|---|
| 400 | `BAD_JSON`, `BAD_LANGUAGE`, `BAD_MODE`, `BAD_SIGNATURE`, `BAD_TESTS`, `BAD_COMPARE`, ... |
| 401 | `UNAUTHORIZED` |
| 404 | `TESTSET_NOT_FOUND` |
| 413 | `CODE_TOO_LARGE`, `BODY_TOO_LARGE` (8 MB) |
| 503 | `BUSY`, with a `Retry-After` header |
| 500 | `INTERNAL` |

### `GET /health` (signed)

```json
{ "ok": true, "service": "judge-lite", "version": "0.1.0", "sandbox": "isolate", "uptimeSec": 3600,
  "queue": { "depth": 0, "busy": 1, "workers": 2, "estimatedWaitMs": 0, "avgJobMs": 640, "rejected": 0, "completed": 412 },
  "latency": { "samples": 412, "total": { "p50Ms": 610, "p95Ms": 2290 }, "judge": { ... }, "queue": { ... } },
  "verdicts": { "AC": 300, "WA": 80, "TLE": 12, "CE": 20 }, "languages": { "cpp": 200, "java": 212 },
  "errors": 0, "testSetSource": "r2" }
```

Set `JUDGE_PUBLIC_HEALTH=1` to serve it unsigned. Do not do that on a public tunnel hostname.

### `GET /livez`

This route is unauthenticated. It returns `ok` and nothing else, for the container healthcheck.

## Function mode (the problem harness)

The plan's language-neutral signature (7.1) generates one driver per language (`src/harness/`). The driver:

1. reads the argument list as JSON from stdin, with inline JSON parsing in C++ and Java;
2. builds typed values;
3. calls the learner's function;
4. writes the return value as JSON to `__result.json`;
5. leaves stdout to the learner.

The gateway then compares JSON values. Numbers are compared by value: integers exactly, even 64-bit; floats by `==` or within epsilon. So `2.50` equals `2.5`, and Java's `1.0E10` equals `1e10`.

**Types:**

- `int`, `long`, `double`, `bool`, `string`, `char`;
- `T[]` for any T, nested to any depth: `int[]`, `int[][]`, `string[]`, `ListNode[]` and so on;
- `ListNode`, as a JSON list `[1,2,3]`;
- `TreeNode`, in LeetCode level order with nulls: `[1,null,2,3]`.

| Type | C++ | Java | Python | JS |
|---|---|---|---|---|
| `int` / `long` / `double` | `int` / `long long` / `double` | `int` / `long` / `double` | `int` / `int` / `float` | `number` (BigInt allowed for long returns) |
| `bool` / `string` / `char` | `bool` / `string` / `char` | `boolean` / `String` / `char` | `bool` / `str` / `str` | `boolean` / `string` / `string` |
| `int[]` / `int[][]` | `vector<int>` / `vector<vector<int>>` | `int[]` / `int[][]` | `list` | `Array` |
| `ListNode` / `TreeNode` | `ListNode*` / `TreeNode*` | `ListNode` / `TreeNode` | LeetCode classes | `{val, next}` / `{val, left, right}` |

**What the learner writes.** This follows LeetCode's conventions, and the browser harness must use the same ones (`fnNameFor()` in `src/harness/types.ts`).

**C++.** Write `class Solution { public: long long busiestStretch(vector<int>& plays, int k) {...} };`.

- `bits/stdc++.h` and `using namespace std` are already included.
- `ListNode`/`TreeNode` are predefined when the signature uses them.
- Errors point at `solution.cpp:<line>` (a `#line` directive).

**Java.** Write `class Solution { public long busiestStretch(int[] plays, int k) {...} }`.

- `java.util.*`, `java.util.function.*`, `java.util.stream.*`, `java.io.*` and `java.math.*` are imported on line 1, so line numbers do not shift.
- Do not declare a `package`.
- Do not redefine `ListNode`/`TreeNode`.

**Python.** Write a module-level `def busiest_stretch(plays, k)` (snake_case), or `class Solution` with `busiest_stretch`/`busiestStretch`.

- `List`, `Optional`, `ListNode` and `TreeNode` are predefined.
- Deep recursion is allowed: there is a 256 MB thread stack and a raised recursion limit.

**JavaScript.** Write `function busiestStretch(plays, k)`, or `class Solution` with that method.

- `ListNode`/`TreeNode` are provided unless the learner defines their own.

The four signatures the owner listed have generated drivers, unit tests (structure), and integration tests (real compile and run, C++ and Java):

- `int[] -> int`
- `(int[], int) -> int[]`
- `string -> bool`
- `(int[][]) -> int`

`ListNode` and `TreeNode` are covered the same way.

**Not yet supported:**

- `void` + in-place output params;
- `design` mode (class with a sequence of calls);
- custom checkers.

## Comparators

| Mode | stdio | function |
|---|---|---|
| `exact` (default) | same text after normalising CRLF, trailing spaces at line ends and trailing blank lines | equal JSON values |
| `token` | same whitespace-separated tokens | same as exact |
| `float:<eps>` | tokens; numbers match if \|a-b\| ≤ eps or ≤ eps·\|expected\| | the same rule on every number in the value |
| `unordered` | same multiset of non-empty lines | top-level array as a multiset |
| `unordered:deep` | n/a | every array at every depth as a multiset |

## Limits

| Limit | Value | Where |
|---|---|---|
| Code size | 64 KB | gateway (413) |
| Request body | 8 MB, at most 200 tests | gateway |
| Run memory | 256 MB default, max 512 (box cgroup); **Java: `-Xmx` = the limit, box = 2× (512 MB total)**; JS: limit + 64 MB | isolate `--cg-mem` |
| CPU time | `timeMs` (default 2000, max 10 000) × factor + startup: C++ ×1, Java ×1.5 + 500 ms, Python ×3 + 300 ms, JS ×2 + 300 ms | isolate `--time` |
| Wall time | 2 × CPU limit + 1 s (minimum 3 s) | isolate `--wall-time` |
| Processes/threads | 64 | isolate `--processes` |
| File size | 16 MB per file (compile box: 64 MB) | isolate `--fsize` |
| Output | 1 MB (stdout or returned value) → OLE | gateway |
| Stack | = run memory (deep recursion works) | isolate `--stack` |
| Network | none: isolate's empty network namespace (loopback only) | isolate default |
| Filesystem | `/usr`, `/bin` and `/lib` read-only, plus the box dir and a private `/tmp`; no `/etc` (Java gets `/etc/java-21-openjdk` read-only) | isolate dir rules |
| User | uid/gid 60000 + box id | isolate |
| Syscalls | isolate's restrictions on (keyrings, vsock, cross-box locks, io_uring, legacy archs) | `syscall_flags = 31` |
| Compile | 15 s CPU, 30 s wall, 768 MB, 64 processes | isolate |
| Queue | 503 + `Retry-After` when the estimated wait is over 30 s, or a queued job has already waited 30 s | gateway |

All limits can be changed with `JUDGE_*` env vars; see `deploy/judge.env.example` and `src/config.ts`.

## Sandbox: production path, and local testing

**isolate is the only sandbox, in production and locally.** isolate 2.7 with cgroup v2 works inside Docker Desktop on this Mac (Apple Silicon, LinuxKit kernel 6.12, cgroup v2), in a container started with `--privileged --cgroupns=private`. The integration suite runs the same image, the same flags and the same isolate config as the VM. **No fallback sandbox was needed, so none is included:** an unused second sandbox would only be an untested escape hatch.

If a future machine cannot run isolate (for example, Docker without privileged containers), do not swap in a weaker sandbox for production. Run the integration suite on a Linux VM instead.

How the container provides isolate's cgroup tree, in `docker/entrypoint.sh`:

1. With `--cgroupns=private` the container sees its own cgroup root.
2. The entrypoint moves its processes into a leaf (`/sys/fs/cgroup/init`).
3. It enables the `cpu`, `memory` and `pids` controllers.
4. It creates `/sys/fs/cgroup/isolate`, which is `cg_root` in `docker/isolate.cf`.
5. It drops to the unprivileged `judge` user and starts the gateway. Only the setuid-root `isolate` binary has privileges.

Upstream isolate notes that containers are "not recommended" because managers do not delegate cgroups properly. The delegation above handles that, and the VM runs nothing else.

Architecture notes:

- The integration suite ran on **arm64**. Lightsail is **x86-64**; the Dockerfile is multi-arch (JDK path via `/usr/lib/jvm/jdk21`, Node tarball by arch).
- `PLATFORM=linux/amd64 bash test/integration.sh` builds the x86-64 image on a Mac, and that build was verified. isolate cannot *run* under emulation, though: `clone` with namespace flags is not implemented there. The gateway's startup self-check catches this and refuses to start, so x86-64 judging must be verified on the VM itself (runbook step 5).
- Integer division by zero traps (`SIGFPE` → RE) on x86-64 only. arm64 returns 0, so that one case is skipped on arm64.

## Local dev loop

```bash
cd services/judge
npm install                 # dev-only: typescript + @types/node (the runtime has no npm deps)
npm test                    # unit tests: HMAC, comparators, driver generator, queue, verdict mapping
npm run typecheck
bash test/integration.sh    # builds the image, starts it like production, judges 40+ sample solutions
ONLY=java bash test/integration.sh

# Run it and talk to it
cp deploy/judge.env.example .env && sed -i '' "s/^JUDGE_HMAC_SECRETS=.*/JUDGE_HMAC_SECRET=$(openssl rand -hex 32)/" .env
docker compose up --build
JUDGE_HMAC_SECRET=$(sed -n 's/^JUDGE_HMAC_SECRET=//p' .env) node client/cli.ts health
JUDGE_HMAC_SECRET=... node client/cli.ts run cpp my.cpp "2 3"
```

The gateway runs TypeScript directly (Node ≥ 22.18 type stripping), so there is no build step. Code must stick to erasable TS syntax (`erasableSyntaxOnly` in tsconfig).

## Deploy runbook (Lightsail, Mumbai)

### 1. Create the instance

1. In Lightsail, choose **Create instance**:
   - Region: Mumbai (`ap-south-1`), Linux/Unix, OS only, **Ubuntu 24.04 LTS**.
   - Plan: **$12 (2 GB, 2 vCPU)** for beta, **$24 (4 GB)** at launch.
   - Name: `judge-lite-1`.
   - Add your SSH key.
2. Instance → **Networking**:
   - **Delete the HTTP (80) rule**, keeping only SSH (22).
   - Optionally restrict SSH to your IP.
   - A static IP is optional: nothing connects in except your SSH.

### 2. Bootstrap and install

```bash
ssh ubuntu@<ip>
sudo git clone https://github.com/<owner>/portfolio-site.git /opt/judge-lite   # or rsync services/judge only
cd /opt/judge-lite
sudo bash services/judge/deploy/bootstrap-vm.sh     # updates, unattended-upgrades, ufw, sshd, Docker, cloudflared, journald
sudo bash services/judge/deploy/install-judge.sh    # builds the image, writes /etc/judge/judge.env, starts judge.service
```

`install-judge.sh` prints two secrets once: `prod` and `staging`. Keep them for step 4.

The repo is private, so cloning needs a read-only deploy key. Alternatively, build on your Mac and copy the image across:

```bash
docker buildx build --platform linux/amd64 -t judge-lite:release services/judge --load
docker save judge-lite:release | gzip | ssh ubuntu@<ip> 'gunzip > /tmp/judge-lite.tar'
# On the VM, with only services/judge copied (rsync -a services/judge ubuntu@<ip>:/opt/judge-lite/services/):
sudo IMAGE_TAR=/tmp/judge-lite.tar bash /opt/judge-lite/services/judge/deploy/install-judge.sh
```

### 3. Create the Cloudflare Tunnel

Use the dashboard-managed tunnel:

1. Go to Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** → **Cloudflared**, and name it `judge-lite`.
2. Copy the connector token. On the VM, run `sudo cloudflared service install <TOKEN>`.
3. Add a **Public hostname**:
   - `judge.systemdesignmastery.dev` (or `judge-staging…`);
   - Service **HTTP** → `localhost:8080`.

   The DNS record is created by the tunnel as a proxied CNAME to `<id>.cfargotunnel.com`.
   - This is the one exception to the "DNS-only" rule for this zone: tunnel hostnames must be proxied.
   - The VM's IP never appears in DNS.
4. Optional defense in depth: put a Cloudflare Access application with a **service token** in front of the hostname. The Worker then also sends `CF-Access-Client-Id`/`CF-Access-Client-Secret`. HMAC already authenticates every request, so this only keeps unauthenticated traffic off the VM entirely.

### 4. Configure the Workers

```bash
# production Worker
npx wrangler secret put JUDGE_HMAC_SECRET            # paste the "prod" secret
#   and in wrangler.jsonc vars:  "JUDGE_URL": "https://judge.systemdesignmastery.dev", "JUDGE_KEY_ID": "prod"
# staging Worker: the same names, with the "staging" secret and JUDGE_KEY_ID "staging"
```

### 5. Verify

```bash
# On the VM: the container and local health
systemctl status judge cloudflared; curl -s localhost:8080/livez; sudo ufw status
# From your Mac, through the tunnel:
JUDGE_URL=https://judge.systemdesignmastery.dev JUDGE_KEY_ID=prod JUDGE_HMAC_SECRET=<prod> node services/judge/client/cli.ts health
# Full suite against the VM (it is x86-64, so the SIGFPE case runs too). The stored-test-set
# cases need JUDGE_TESTSET_DIR on the VM, so expect those three to fail there until R2 is wired.
JUDGE_URL=https://judge-staging.systemdesignmastery.dev JUDGE_KEY_ID=staging JUDGE_HMAC_SECRET=<staging> \
  JUDGE_ARCH=x86_64 node services/judge/test/integration.ts
```

### Operations

- **Logs.** Run `journalctl -u judge -f`. The gateway writes one JSON line per submission: verdict, test counts, judge time and queue time. It never logs code or test data. Docker rotates logs at 10 MB × 5, and journald is capped at 300 MB.
- **Update.**

  ```bash
  cd /opt/judge-lite && sudo git pull && sudo bash services/judge/deploy/install-judge.sh
  ```

  Each build is tagged with a timestamp, and the last 3 are kept.
- **Rollback.**

  ```bash
  docker images judge-lite
  sudo docker tag judge-lite:<tag> judge-lite:current && sudo systemctl restart judge
  ```
- **Restart policy.** systemd sets `Restart=always`, and the unit is enabled at boot. Unattended security upgrades may reboot the VM at 03:30 IST.
- **Rotate a secret.**
  1. Add a new key id to `JUDGE_HMAC_SECRETS`, for example `prod2:<new>`, and restart.
  2. Switch the Worker's `JUDGE_KEY_ID`/`JUDGE_HMAC_SECRET`.
  3. Remove the old entry.
- **Monitoring.**
  - Poll the signed `/health` from the admin judge panel (plan 14.4).
  - Alert on a rising `queue.rejected` (503s), on `errors`, and on p95 creeping past ~3.5 s.
  - Watch the Lightsail **CPU burst capacity** graph (see Capacity).

## Capacity

- **Per submission:** about 2 to 3 s of CPU on the VM for a typical 10 to 30 test submission. Rough split (estimates; on an Apple-silicon Mac a 3-test C++ submission took 0.2 to 0.3 s end to end, and Java 0.3 s; measure on the VM with the integration suite):
  - C++: ~0.1 to 0.3 s compile with the precompiled `bits/stdc++.h` (~0.5 to 2 s without it), plus milliseconds per test.
  - Java: ~0.5 to 1 s `javac`, plus ~50 to 150 ms of JVM start per test.
  - Python/JS re-judges: ~30 to 80 ms per test.
- **2 vCPU** means two workers, so about **40 to 60 submissions a minute in a burst**. That matches the plan's estimate, including Python/JS re-judges.
- **Queueing.**
  - The queue absorbs short spikes. Beyond ~30 s of estimated wait, requests get 503 + `Retry-After`, and the Worker should show "judge is busy, retrying in Ns".
  - The Worker's limits (8 a minute per user, 300 a day) bound any one user.
- **Memory on 2 GB.**
  - The worst case is two Java compiles at once (~450 MB each). Two Java runs need 512 MB each.
  - The container is capped at 85% of RAM (`install-judge.sh` sets it). That fits 2 GB with little headroom; the 4 GB plan at launch is comfortable.
  - Keep swap off (isolate's memory limits do not cover swapped pages).
- **Lightsail plans are burstable.** Sustained CPU above the plan's baseline drains burst credits and then throttles. If the burst graph trends down under normal load, move up a plan, or split staging and production onto separate VMs.
- **Lever if Java dominates:** run all tests of a function-mode submission in one JVM (the driver loops over tests). Today each test gets a fresh process for isolation and exact per-test time and memory.

## Security notes

- **Ingress.**
  - The only way in is the Cloudflare Tunnel, an outbound connection from `cloudflared`.
  - ufw denies all incoming traffic except 22/tcp, and the Lightsail firewall has only 22 open.
  - The container port is published on 127.0.0.1 only. Docker's iptables rules bypass ufw for *published* ports, which is why it must never be published on 0.0.0.0.
- **Authentication.**
  - Every request is signed with HMAC-SHA256 over the method, path, timestamp, nonce and body hash, and compared in constant time.
  - The timestamp window is ±60 s, and nonces are remembered for 2 minutes against replay.
  - Production and staging use separate keys.
  - The gateway refuses to start without a secret of at least 32 chars.
- **Secrets.**
  - Secrets live only in `/etc/judge/judge.env` (root, 0600) on the VM and in Worker secrets.
  - Nothing secret is in the repo: `.env` is gitignored, and `deploy/judge.env.example` holds placeholders.
- **Sandbox.**
  - Untrusted code runs only inside isolate, as uid 60000+N.
  - It has no network (empty netns), read-only toolchains, no `/etc` (Java gets its own config dir), and a private `/tmp`.
  - cgroup limits cap memory and processes, RLIMITs cap file size and stack, and syscall restrictions apply.
  - It runs in a fresh run box per test, so files cannot leak between tests.
  - The integration suite checks the network block, filesystem isolation, the fork-bomb limit and output flooding.
- **Gateway.**
  - It runs as an unprivileged user with no npm runtime dependencies, in a read-only root filesystem.
  - It reads box files with `O_NOFOLLOW` and only accepts regular files. isolate also deletes symlinks and special files the program creates.
- **The container is privileged.** That is how isolate can create namespaces and cgroups; a privileged container is close to root on the VM. Mitigations:
  - The VM is single-purpose.
  - The gateway is unprivileged and reachable only with a valid signature.
  - Untrusted code never runs outside isolate.

  If you prefer not to run a privileged container, install isolate and the gateway directly on the VM (`isolate.service` + a systemd unit for `node src/server.ts`). That is the same security model without Docker.
- **Data exposure.**
  - Hidden tests never return expected outputs.
  - Only the first failing hidden input is returned, truncated to 256 chars.
  - Logs contain no code or test data.

## Not done yet (follow-ups)

- **R2 test-set fetch.** `R2TestSetSource` is a stub. Implement it with a read-only R2 token (SigV4 GET) or a Worker-issued presigned URL. The interface, LRU cache and file format are in place, and local directories work today (`JUDGE_TESTSET_DIR`).
- **Not in this version:**
  - large seeded test generators and output-hash checks (plan 7.1);
  - `design` mode;
  - `void`/in-place signatures;
  - custom checkers.
- **The Worker route `/api/dsa/judge`** (sign-in, rate limit, daily cap, access check, then `callJudge`) belongs in the site code and is not part of this service.
