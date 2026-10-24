/**
 * Week 9, day 5 overview (security architecture): the whole lesson in four tabs. PR #4521's leaked
 * live key and database password and everywhere it spread; defence in depth (perimeter, network,
 * application, data, monitoring), each layer stopping a different attack; secrets fetched at
 * runtime and rotated, TLS/mTLS in transit and the master → tenant → data key hierarchy; and
 * identity (bcrypt, MFA, 15-minute JWTs), RBAC, the tenant check and the default posture.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- the incident */

const SPREAD = ["GitHub history", "Docker layers", "CI/CD logs", "dev laptops", "forks"];
const SPREAD_N = ["git", "images", "CI logs", "laptops", "forks"];

function Incident({ step, t, narrow }: SceneProps) {
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "PR #4521" : "pull request #4521 · add analytics integration"}
        </Txt>
        <rect className="ax-box" x={20} y={44} width={560} height={108} />
        <Txt x={36} y={80} k="s" anchor="start" tone="bad">
          {narrow ? '+ API_KEY = "sk_live_a8f7…"' : '+ ANALYTICS_API_KEY = "sk_live_a8f7g9h2j3k4l5m6n7o8p9"'}
        </Txt>
        <Txt x={36} y={116} k="s" anchor="start" tone="bad">
          {narrow ? "+ postgres://admin:Super…" : "+ DATABASE_URL = postgres://admin:SuperSecret123@prod-db…"}
        </Txt>
        <g opacity={seg(t, 0.4, 0.8)}>
          <Box x={20} y={176} w={560} h={56} label={narrow ? "ALERT: credential in commit" : "Security Bot · ALERT: credential detected in commit"} tone="bad" />
        </g>
        <Txt x={20} y={H - 20} anchor="start">
          {narrow ? "in main 3 h · deployed 2 h ago" : "in main for 3 hours · production deployed 2 hours ago"}
        </Txt>
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          the secret is now in
        </Txt>
        <Box x={220} y={48} w={160} h={48} label={narrow ? "the key" : "sk_live_…"} tone="bad" />
        {SPREAD.map((s, i) => {
          const x = 20 + i * 114;
          const k = ease(seg(t, i * 0.12, i * 0.12 + 0.5));
          return (
            <g key={s}>
              <Wire d={`M300 96L${x + 52} 180`} dash />
              <Token x={lerp(300, x + 52, k)} y={lerp(96, 180, k)} s={10} tone="bad" />
              <Box x={x} y={180} w={104} h={52} label={narrow ? SPREAD_N[i] : s.split(" ")[0]} sub={narrow ? undefined : s.split(" ")[1]} tone={k >= 1 ? "bad" : undefined} />
            </g>
          );
        })}
        <Txt x={20} y={H - 20} anchor="start" tone="bad">
          {narrow ? "deleting it now is too late" : "even if you delete it now, it has been exposed"}
        </Txt>
      </g>
    );
  const why: [string, string][] = [
    ["no secrets scanning in CI", "no CI scanning"],
    ["a dev could see the prod password", "no separation"],
    ["a password at all, not IAM roles", "no IAM roles"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        why did this happen?
      </Txt>
      {why.map(([a, b], i) => (
        <g key={a} opacity={seg(t, i * 0.2, i * 0.2 + 0.3)}>
          <Token x={36} y={78 + i * 50} s={12} tone="bad" />
          <Txt x={56} y={83 + i * 50} k="t" anchor="start">
            {narrow ? b : a}
          </Txt>
        </g>
      ))}
      <Box x={20} y={228} w={560} h={52} label={narrow ? "fix: the architecture" : "fix: a security architecture that makes it impossible"} tone="ok" opacity={seg(t, 0.7, 1)} />
    </g>
  );
}

/* ---------------------------------------------------------------- defence in depth */

const LAYERS: { n: string; d: string; atk: string; atkN: string; stop: string; stopN: string }[] = [
  { n: "Perimeter", d: "WAF · DDoS · rate limit", atk: "request|flood", atkN: "flood", stop: "rate limited at the edge", stopN: "rate limited" },
  { n: "Network", d: "VPC · private subnets", atk: "direct DB|connection", atkN: "DB connect", stop: "DB is in a private subnet", stopN: "private subnet" },
  { n: "Application", d: "authn · authz · validation", atk: "another|tenant's doc", atkN: "x-tenant", stop: "authorization denied: tenant mismatch", stopN: "tenant mismatch" },
  { n: "Data", d: "TLS · AES-256 · field encryption", atk: "a stolen|backup", atkN: "backup", stop: "SSNs are ciphertext", stopN: "ciphertext" },
];

function Depth({ step, t, narrow }: SceneProps) {
  const y0 = 50;
  const lh = 46;
  const k = ease(seg(t, 0, 0.7));
  const ly = (i: number) => y0 + i * lh;
  const stopY = ly(step) + lh / 2 - 4;
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "defence in depth" : "defence in depth · each layer assumes the others might fail"}
      </Txt>
      {LAYERS.map((l, i) => (
        <g key={l.n}>
          <rect className={`ax-box ${i === step ? "lit" : i < step ? "ok" : ""}`} x={130} y={ly(i)} width={450} height={lh - 8} />
          <Txt x={144} y={ly(i) + 24} k="t" anchor="start" tone={i <= step ? undefined : "mute"}>
            {l.n}
          </Txt>
          {!narrow && (
            <Txt x={568} y={ly(i) + 24} k="s" anchor="end">
              {l.d}
            </Txt>
          )}
        </g>
      ))}
      <rect className={`ax-box ${t > 0.75 ? "sky" : ""}`} x={130} y={ly(4)} width={450} height={lh - 8} />
      <Txt x={144} y={ly(4) + 24} k="t" anchor="start" tone={t > 0.75 ? "sky" : "mute"}>
        Monitoring
      </Txt>
      {!narrow && (
        <Txt x={568} y={ly(4) + 24} k="s" anchor="end" tone={t > 0.75 ? "sky" : undefined}>
          {t > 0.75 ? "attempt logged · alert" : "audit · intrusion detection"}
        </Txt>
      )}
      <Txt x={20} y={ly(0) + 24} k="s" anchor="start" tone="bad">
        {narrow ? LAYERS[step].atkN : LAYERS[step].atk.split("|")[0]}
      </Txt>
      {!narrow && (
        <Txt x={20} y={ly(0) + 42} k="s" anchor="start" tone="bad">
          {LAYERS[step].atk.split("|")[1]}
        </Txt>
      )}
      <Token x={lerp(60, 280, Math.min(1, k * 1.5))} y={lerp(ly(0) - 6, stopY, k)} s={12} tone="bad" />
      <Txt x={20} y={H - 16} anchor="start" tone="ok" opacity={seg(t, 0.7, 1)}>
        {narrow ? LAYERS[step].stopN : LAYERS[step].stop}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- secrets + keys */

function Keys({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.2, i * 0.2 + 0.3);
  if (step <= 1) {
    const k = ease(seg(t, 0.1, 0.7));
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {step === 0 ? "secrets · fetched at runtime" : "rotation · no restart"}
        </Txt>
        <Box x={20} y={70} w={170} h={70} label="Vault" sub={step === 1 ? (t > 0.4 ? "password v2" : "password v1") : "Secrets Mgr"} tone="lit" />
        <Box x={250} y={70} w={150} h={70} label="App" sub={step === 0 ? "cache 5 min" : t > 0.8 ? "new conn: v2" : "pool: v1"} tone={step === 1 && t > 0.8 ? "ok" : undefined} />
        <Box x={450} y={70} w={130} h={70} label={narrow ? "DB" : "Database"} sub={step === 1 && t > 0.4 ? "v2 set" : undefined} />
        <Wire d="M190 105H250" tone="lit" arrow />
        <Wire d="M400 105H450" arrow />
        <Token x={lerp(190, 250, k)} y={105} s={10} tone="lit" />
        {step === 0 &&
          ["code", narrow ? "env" : "env vars", narrow ? "images" : "container images"].map((s, i) => (
            <g key={s} opacity={o(i + 1)}>
              <Box x={20 + i * 190} y={180} w={180} h={50} label={`✗ ${s}`} tone="bad" />
            </g>
          ))}
        {step === 1 && (
          <Txt x={20} y={200} k="t" anchor="start" tone="ok" opacity={o(3)}>
            {narrow ? "fetch per connection" : "credentials fetched per connection pick up the rotation"}
          </Txt>
        )}
        <Txt x={20} y={H - 16} anchor="start">
          {step === 0 ? (narrow ? "never in code, env or images" : "never in code, environment variables or images") : narrow ? "rotated automatically" : "rotated automatically · audit logged"}
        </Txt>
      </g>
    );
  }
  if (step === 2) {
    const hops: [string, string][] = [
      ["Client", "TLS 1.2+"],
      [narrow ? "LB" : "Load bal.", "mTLS"],
      ["Service", "TLS"],
      [narrow ? "DB" : "Database", ""],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          in transit · no plaintext hop
        </Txt>
        {hops.map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + i * 148} y={80} w={116} h={56} label={a} tone={i === 3 ? "ok" : undefined} />
            {b && <Wire d={`M${136 + i * 148} 108H${168 + i * 148}`} tone="lit" arrow />}
            {b && (
              <Txt x={152 + i * 148} y={170} k="s" tone="lit">
                {b}
              </Txt>
            )}
          </g>
        ))}
        <Txt x={20} y={230} k="t" anchor="start" tone="ok" opacity={o(4)}>
          {narrow ? "at rest: AES-256 + KMS" : "at rest: TDE, SSE-KMS · sensitive fields encrypted in app"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "TDE alone: a DBA reads plaintext" : "TDE alone still shows a DBA plaintext; field encryption doesn't"}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        key hierarchy
      </Txt>
      <Box x={200} y={44} w={200} h={52} label="Master key" sub={narrow ? "in the HSM" : "never leaves the HSM"} tone="lit" />
      {[
        [narrow ? "Tenant A" : "Tenant key A", 30],
        [narrow ? "Tenant B" : "Tenant key B", 230],
        [narrow ? "Service" : "Service keys", 430],
      ].map(([n, x], i) => (
        <g key={n as string} opacity={o(i)}>
          <Wire d={`M300 96L${(x as number) + 70} 136`} />
          <Box x={x as number} y={136} w={140} h={44} label={n as string} tone={i < 2 ? "sky" : undefined} />
          <Wire d={`M${(x as number) + 70} 180V206`} />
          <Box x={(x as number) + 10} y={206} w={120} h={40} label="data keys" sub={undefined} />
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok" opacity={o(3)}>
        {narrow ? "A can't decrypt B" : "tenant A can't decrypt B · master rotation re-encrypts nothing"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- identity */

const ROLES: [string, number][] = [
  ["viewer", 2],
  ["editor", 3],
  ["admin", 8],
  ["owner", 11],
];

function Identity({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.18, i * 0.18 + 0.3);
  if (step === 0) {
    const flow: [string, string, Tone][] = [
      ["password", "bcrypt", undefined],
      ["MFA", "TOTP code", "sky"],
      ["access JWT", "15 min", "ok"],
      ["refresh", "7 days", "ok"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          authentication · who are you?
        </Txt>
        {flow.map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + i * 142} y={80} w={130} h={70} label={a} sub={b} tone={tone} />
          </g>
        ))}
        <Txt x={20} y={200} k="t" anchor="start" tone="warn" opacity={o(4)}>
          {narrow ? "failures are rate limited" : "failed logins are rate limited: too many attempts, try later"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "short-lived tokens, not passwords" : "short-lived tokens, not passwords, on every request"}
        </Txt>
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          authorization · RBAC
        </Txt>
        {ROLES.map(([r, n], i) => (
          <g key={r} opacity={o(i)}>
            <Txt x={20} y={84 + i * 50} k="t" anchor="start">
              {r}
            </Txt>
            {Array.from({ length: 11 }, (_, j) => (
              <rect key={j} className={j < n ? "ax-fill ok" : "ax-meter"} x={130 + j * 40} y={68 + i * 50} width={28} height={22} />
            ))}
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "each role: only what it needs" : "permissions per role · least privilege · every check audited"}
        </Txt>
      </g>
    );
  if (step === 2) {
    const k = ease(seg(t, 0, 0.6));
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          the tenant check comes first
        </Txt>
        <Box x={20} y={80} w={160} h={60} label="user" sub="tenant: acme" />
        <Box x={420} y={80} w={160} h={60} label="document" sub="tenant: globex" tone={t > 0.6 ? "bad" : undefined} />
        <Wire d="M180 110H420" dash />
        <Token x={lerp(180, 410, k)} y={110} s={12} tone={t > 0.6 ? "bad" : "lit"} />
        <Txt x={300} y={186} k="t" tone="bad" opacity={seg(t, 0.6, 0.9)}>
          {narrow ? "denied · tenant_mismatch" : "denied · reason: tenant_mismatch"}
        </Txt>
        <Txt x={300} y={216} k="s" opacity={seg(t, 0.7, 1)}>
          {narrow ? "audit logged" : "written to the audit log, before any permission check"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "else: guess an ID, read it" : "without it, anyone can read any document by guessing IDs"}
        </Txt>
      </g>
    );
  }
  const rules = ["deny by default", "validate all input", "encrypt everything", "log everything", "rotate credentials", "assume compromise"];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone="ok">
        the default security posture
      </Txt>
      {rules.map((r, i) => (
        <g key={r} opacity={seg(t, i * 0.12, i * 0.12 + 0.3)}>
          <Box x={20 + (i % 2) * 290} y={56 + Math.floor(i / 2) * 70} w={270} h={54} label={r} tone="ok" />
        </g>
      ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "depth") return <Depth {...p} />;
  if (p.variant === "keys") return <Keys {...p} />;
  if (p.variant === "identity") return <Identity {...p} />;
  return <Incident {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "incident",
      label: "Incident",
      steps: [
        { caption: "Pull request 4521 adds an analytics integration, with a live API key and the production database password in the code. The security bot fires.", tween: 1400, ms: 3400 },
        { caption: "It has been in main for 3 hours and deployed for 2. The secret is now in git history, Docker layers, CI logs, laptops and forks. Deleting it doesn't undo that.", tween: 1800, ms: 3800 },
        { caption: "No secrets scanning in CI, no separation between dev and production, and a password where IAM roles belonged. The fix is an architecture, not a reminder.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "depth",
      label: "Layers",
      steps: [
        { caption: "Defence in depth: perimeter, network, application, data and monitoring. A request flood is stopped at the perimeter by the WAF, DDoS protection and rate limits.", tween: 1600 },
        { caption: "A direct connection to the database fails at the network layer: databases sit in private subnets inside the VPC.", tween: 1600 },
        { caption: "A request for another tenant's document reaches the application, which authenticates, authorizes, and denies it.", tween: 1600 },
        { caption: "Even a stolen backup leaks nothing: data is encrypted, and sensitive fields like SSNs are ciphertext. Monitoring logs every attempt.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "keys",
      label: "Secrets & keys",
      steps: [
        { caption: "Secrets live in Vault or Secrets Manager and are fetched at runtime with a 5-minute cache, never in code, environment variables or container images.", tween: 1400, ms: 3400 },
        { caption: "Rotation needs no restart: the database password changes, and new connections fetch the new credential.", tween: 1600, ms: 3200 },
        { caption: "In transit, no hop is plaintext: TLS 1.2 or later from the client, mTLS between services, TLS to the database. At rest, storage and sensitive fields are encrypted.", tween: 1600, ms: 3600 },
        { caption: "Keys form a hierarchy: a master key that never leaves the HSM, a key per tenant, data keys below. Tenant A can't decrypt tenant B.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "identity",
      label: "Identity",
      steps: [
        { caption: "Authentication: passwords hashed with bcrypt, MFA by TOTP, then a 15-minute access token and a 7-day refresh token. Failed logins are rate limited.", tween: 1400, ms: 3400 },
        { caption: "Authorization is role-based: viewer, editor, admin and owner each get only the permissions they need, and every check is audited.", tween: 1400, ms: 3200 },
        { caption: "Tenant isolation comes first: an acme user asking for a globex document is denied with tenant_mismatch, and the attempt is logged.", tween: 1400, ms: 3200 },
        { caption: "The default posture: deny by default, validate all input, encrypt everything, log everything, rotate credentials, and assume compromise.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
