/**
 * Week 9, day 4 overview (right to deletion): the whole lesson in four tabs. The Article 17 ticket
 * and the dozen systems holding the user's data, and what "deletion" may mean; the data inventory,
 * the strategy matrix and foreign keys; the orchestrated run (PENDING with a 30-day deadline,
 * priority order, verification, an audit trail that survives); and the special cases (backups
 * that expire, anonymized orders kept for tax, shared content, audit logs).
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const cell = (i: number) => ({ x: 20 + (i % 4) * 142, y: 52 + Math.floor(i / 4) * 58 });

function Grid({ names, tone, sub, narrow }: { names: string[]; tone: (i: number) => Tone; sub: (i: number) => string; narrow: boolean }) {
  return (
    <g>
      {names.map((n, i) => {
        const c = cell(i);
        return <Box key={n} x={c.x} y={c.y} w={134} h={48} label={narrow && n.length > 9 ? n.slice(0, 7) + "…" : n} sub={sub(i)} tone={tone(i)} />;
      })}
    </g>
  );
}

/* ---------------------------------------------------------------- the request */

const WHERE = ["PostgreSQL", "MongoDB", "Elasticsearch", "Redis", "S3", "BigQuery", "Mixpanel", "Stripe", "Zendesk", "Intercom", "Backups", "Logs"];

function Request({ step, t, narrow }: SceneProps) {
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "support ticket" : "support ticket · from angry.user@example.com"}
        </Txt>
        <rect className="ax-box warn" x={20} y={44} width={560} height={170} />
        {(narrow
          ? ["GDPR Article 17:", "delete ALL my data", "from ALL your systems", "within 30 days."]
          : ["I am exercising my right to erasure", "under GDPR Article 17. Delete ALL my", "personal data from ALL your systems", "within 30 days. Confirm in writing."]
        ).map((l, i) => (
          <Txt key={l} x={44} y={84 + i * 34} k="t" anchor="start" opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
            {l}
          </Txt>
        ))}
        <Txt x={20} y={252} k="d" anchor="start" tone="lit">
          1 month
        </Txt>
        <Txt x={20} y={H - 20} anchor="start">
          {narrow ? "+2 months for complex cases" : "to respond · up to 2 more for complex cases"}
        </Txt>
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {"where this user's data lives"}
        </Txt>
        <Grid names={WHERE} narrow={narrow} tone={(i) => (t > i / 14 ? "warn" : undefined)} sub={(i) => (["users, orders", "activity", "profile", "sessions", "photos, docs", "events", "product", "payments", "tickets", "chats", "30–90 days", "15–90 days"][i] ?? "")} />
        <Txt x={20} y={252} k="t" anchor="start" tone="bad" opacity={seg(t, 0.8, 1)}>
          {narrow ? "prove it's all gone?" : "Can you prove you deleted everything?"}
        </Txt>
        <Txt x={20} y={H - 20} anchor="start" opacity={seg(t, 0.8, 1)}>
          {narrow ? "not without a system for it" : "Not without a system designed for this."}
        </Txt>
      </g>
    );
  const rows: [string, string, Tone][] = [
    ["hard delete", narrow ? "✓ gone" : "✓ physically removed", "ok"],
    ["soft delete", narrow ? "✗ alone" : "✗ data still exists", "bad"],
    ["anonymize", narrow ? "✓ no identity" : "✓ can't identify anyone", "ok"],
    ["pseudonymize", narrow ? "✗ personal" : "✗ still personal data", "bad"],
    ["aggregate", narrow ? "✓ if anonymous" : "✓ if truly anonymous", "ok"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {'what "deletion" can mean'}
      </Txt>
      {rows.map(([a, b, tone], i) => (
        <g key={a} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
          <Txt x={40} y={74 + i * 46} k="t" anchor="start">
            {a}
          </Txt>
          <Txt x={560} y={74 + i * 46} k="t" anchor="end" tone={tone}>
            {b}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "soft delete = a step, not the end" : "soft delete is only a step before the hard delete"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- inventory */

function Inventory({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.15, i * 0.15 + 0.3);
  if (step === 0) {
    const map: [string, string, string][] = [
      ["PostgreSQL", "DELETE FROM users WHERE id = ?", "DELETE row"],
      ["Elasticsearch", "DELETE /users/_doc/{id}", "DELETE doc"],
      ["Redis", "DEL user:{id}:*", "DEL keys"],
      ["BigQuery", "DELETE FROM events WHERE user_id = ?", "DELETE rows"],
      ["Stripe", "stripe.Customer.delete(id)", "API call"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "data map · user_email" : "data inventory · one element: user_email"}
        </Txt>
        {map.map(([a, b, c], i) => (
          <g key={a} opacity={o(i)}>
            <Token x={30} y={66 + i * 44} s={10} tone="sky" />
            <Txt x={46} y={71 + i * 44} k="t" anchor="start">
              {a}
            </Txt>
            <Txt x={narrow ? 560 : 200} y={71 + i * 44} k="s" anchor={narrow ? "end" : "start"} tone="lit">
              {narrow ? c : b}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "where · retention · method · deps" : "per element: locations, retention, deletion method, dependencies"}
        </Txt>
      </g>
    );
  }
  if (step === 1) {
    const bands: [string, string, Tone][] = [
      ["immediate", narrow ? "DB · search · cache · files" : "primary DB · search · cache · file storage", "ok"],
      ["24–48 hours", "analytics: delete or anonymize", "sky"],
      ["varies", narrow ? "third parties" : "third parties: API call, confirmation", "warn"],
      ["per policy", narrow ? "backups · logs expire" : "backups and logs: let them expire", "warn"],
      ["next cycle", narrow ? "ML: retrain" : "ML models: retrain without the user", "mute"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          strategy by system type
        </Txt>
        {bands.map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <rect className={`ax-box ${tone || ""}`} x={20} y={46 + i * 48} width={560} height={38} />
            <Txt x={32} y={70 + i * 48} k="t" anchor="start">
              {a}
            </Txt>
            {!narrow && (
              <Txt x={176} y={70 + i * 48} k="s" anchor="start">
                {b}
              </Txt>
            )}
          </g>
        ))}
        {narrow && (
          <Txt x={20} y={H - 14} anchor="start">
            immediate → next model cycle
          </Txt>
        )}
      </g>
    );
  }
  const ops: [string, string, Tone][] = [
    ["notifications", "DELETE", "bad"],
    ["sessions", "DELETE", "bad"],
    ["orders", "user_id = NULL", "warn"],
    ["users", "DELETE last", "bad"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        foreign keys · order matters
      </Txt>
      {ops.map(([a, b, tone], i) => {
        const on = t > 0.15 + i * 0.2;
        return (
          <g key={a}>
            <Box x={20} y={48 + i * 54} w={200} h={44} label={a} tone={on ? tone : undefined} />
            <Txt x={240} y={76 + i * 54} k="t" anchor="start" tone={on ? tone : "mute"}>
              {`${i + 1} · ${b}`}
            </Txt>
          </g>
        );
      })}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "leaves first, user last" : "leaf records first, anonymize what you must keep, user last"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- orchestration */

const TARGETS = ["Elasticsearch", "S3", "BigQuery", "Mixpanel", "Stripe", "Zendesk", "Intercom", "Mailchimp", "PostgreSQL", "Redis", "CDN", "Backups"];
const PRIO = [2, 3, 4, 4, 5, 5, 5, 5, 10, 11, 11, 0];
const AT: Record<number, number> = { 2: 0.1, 3: 0.24, 4: 0.38, 5: 0.52, 10: 0.68, 11: 0.84 };

function Orchestrate({ step, t, narrow }: SceneProps) {
  const done = (i: number) => (step > 1 ? true : step === 1 ? PRIO[i] > 0 && t >= AT[PRIO[i]] : false);
  const status: [string, Tone] =
    step === 0 ? ["PENDING · deadline in 30 days", "lit"] : step === 1 ? (t < 1 ? ["IN_PROGRESS", "lit"] : ["AWAITING_VERIFICATION", "sky"]) : step === 2 ? ["COMPLETED · verified", "ok"] : ["COMPLETED · proof kept", "ok"];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {["1 · create the request", "2 · execute in priority order", "3 · verify every system", "4 · audit and notify"][step]}
      </Txt>
      <g opacity={step === 3 ? 1 - seg(t, 0, 0.4) : 1}>
        <Grid
          names={TARGETS}
          narrow={narrow}
          tone={(i) => (PRIO[i] === 0 ? (step > 0 ? "warn" : undefined) : done(i) ? "ok" : step === 1 ? "lit" : undefined)}
          sub={(i) => (PRIO[i] === 0 ? (step > 0 ? "expire" : "pending") : step >= 2 ? "0 found ✓" : done(i) ? "deleted" : step === 0 ? "pending" : `p${PRIO[i]}`)}
        />
      </g>
      {step === 3 && (
        <g opacity={seg(t, 0, 0.5)}>
          <Box x={60} y={80} w={480} h={60} label={narrow ? "audit: USER_DELETED" : "audit log · USER_DELETED · user_id = DELETED"} tone="lit" />
          <Box x={60} y={156} w={230} h={44} label={narrow ? "email" : "confirmation email"} tone="ok" />
          <Box x={310} y={156} w={230} h={44} label={narrow ? "certificate" : "compliance certificate"} tone="ok" />
        </g>
      )}
      <Txt x={20} y={252} k="t" anchor="start" tone={status[1]}>
        {narrow ? status[0].split(" · ")[0] : status[0]}
      </Txt>
      <Txt x={20} y={H - 16} anchor="start">
        {[narrow ? "the timer starts" : "record it, start the 30-day timer, tell the user", narrow ? "caches after the DB" : "search, files, analytics, third parties, PostgreSQL, caches", narrow ? "failure → retry" : "a failure leaves PARTIALLY_COMPLETED for a retry", narrow ? "the proof survives" : "the audit trail survives the deletion"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- special cases */

function Special({ step, t, narrow }: SceneProps) {
  const k = ease(seg(t, 0.1, 0.8));
  const kick = ["backups · can't remove one user", "financial records · legal retention", "shared content", "audit logs"][step];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {kick}
      </Txt>
      {step === 0 && (
        <g>
          <line className="ax-wire" x1={40} x2={560} y1={120} y2={120} />
          {[
            [0, "day 0", narrow ? "primary" : "primary deleted", "ok"],
            [30, "day 30", narrow ? "daily" : "daily backups expire", "warn"],
            [90, "day 90", narrow ? "weekly" : "weekly backups expire", "ok"],
          ].map(([d, a, b, tone]) => {
            const x = lerp(40, 560, (d as number) / 90);
            return (
              <g key={a as string} opacity={k >= (d as number) / 90 ? 1 : 0.3}>
                <rect className={`ax-fill ${tone}`} x={x - 6} y={114} width={12} height={12} />
                <Txt x={x} y={98} k="t" anchor={d === 0 ? "start" : d === 90 ? "end" : "middle"}>
                  {a as string}
                </Txt>
                <Txt x={x} y={d === 30 ? 172 : 150} k="s" anchor={d === 0 ? "start" : d === 90 ? "end" : "middle"}>
                  {b as string}
                </Txt>
              </g>
            );
          })}
          <Token x={lerp(40, 560, k)} y={120} s={10} tone="lit" />
          <Box x={40} y={192} w={520} h={50} label={narrow ? "restore? re-apply deletions" : "restore before then? re-apply pending deletions first"} tone="sky" />
        </g>
      )}
      {step === 1 && (
        <g>
          <rect className="ax-box" x={20} y={56} width={560} height={130} />
          {[
            ["user_id", "{user_id}", "NULL"],
            ["address", "{address}", "DELETED"],
            ["amount", "kept", "kept"],
          ].map(([f, a, b], i) => (
            <g key={f}>
              <Txt x={40} y={84 + i * 44} k="s" anchor="start">
                {f}
              </Txt>
              <Txt x={narrow ? 250 : 220} y={84 + i * 44} k="t" anchor="start" tone={t > 0.5 && a !== b ? "warn" : undefined}>
                {t > 0.5 ? b : a}
              </Txt>
            </g>
          ))}
          <Txt x={20} y={226} k="t" anchor="start" tone="ok" opacity={seg(t, 0.6, 1)}>
            {narrow ? "order kept 7 years" : "the order is kept, anonymized, for 7 years of tax law"}
          </Txt>
        </g>
      )}
      {step === 2 && (
        <g>
          <Box x={20} y={56} w={250} h={130} label={t > 0.5 ? "@deactivateduser" : "the author"} sub={narrow ? "messages kept" : "messages, files kept"} tone={t > 0.5 ? "sky" : undefined} />
          <Box x={290} y={56} w={290} h={130} label={narrow ? "profile" : "profile"} sub={t > 0.5 ? "name, email, photo ✗" : "name, email, photo"} tone={t > 0.5 ? "bad" : undefined} />
          <Txt x={20} y={226} k="t" anchor="start" tone="warn" opacity={seg(t, 0.6, 1)}>
            {narrow ? "a legal hold can stop it" : "a legal hold can prevent all deletion"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g>
          <Box x={20} y={56} w={560} h={50} label={narrow ? (t > 0.4 ? "user_id = 'DELETED'" : "user_id = {id}") : t > 0.4 ? "audit_logs · user_id = 'DELETED'" : "audit_logs · user_id = {id}"} tone={t > 0.4 ? "ok" : undefined} />
          <Box x={20} y={120} w={560} h={50} label={narrow ? "+ USER_DELETED" : "+ new record: USER_DELETED"} tone="lit" opacity={seg(t, 0.5, 0.8)} />
          <Txt x={20} y={210} k="t" anchor="start" tone="bad" opacity={seg(t, 0.7, 1)}>
            {narrow ? "deleting them = no proof" : "deleting them leaves no proof (and looks like a cover-up)"}
          </Txt>
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start">
        {[narrow ? "let backups expire, track pending" : "let backups expire under policy; track pending deletions", narrow ? "Art. 17(3)(b): legal obligation" : "Article 17(3)(b): compliance with a legal obligation", narrow ? "keep context, drop identity" : "collaborative content keeps context, loses identity", narrow ? "anonymize, never delete" : "anonymize audit logs, never delete them"][step]}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "inventory") return <Inventory {...p} />;
  if (p.variant === "run") return <Orchestrate {...p} />;
  if (p.variant === "special") return <Special {...p} />;
  return <Request {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "request",
      label: "The request",
      steps: [
        { caption: "A user invokes GDPR Article 17: delete all my personal data from all your systems. You have one month to respond, two more for complex cases.", tween: 1400, ms: 3600 },
        { caption: "Their data is in PostgreSQL, MongoDB, Elasticsearch, Redis, S3, BigQuery, Mixpanel, Stripe, Zendesk, Intercom, backups and logs. Can you prove you deleted everything?", tween: 2000, ms: 3800 },
        { caption: "Hard delete and true anonymization count. Soft delete alone doesn't, the data still exists, and pseudonymized data is still personal data.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "inventory",
      label: "Inventory",
      steps: [
        { caption: "First, a data inventory. For user_email: where it lives, how long it's kept, and the exact deletion method in each system, from SQL DELETE to a Stripe API call.", tween: 1400, ms: 3600 },
        { caption: "Each system type has its own strategy: databases, search, caches and files immediately, analytics within 24 to 48 hours, backups and logs by expiry, ML at the next retrain.", tween: 1400, ms: 3800 },
        { caption: "Foreign keys set the order: delete leaf records like notifications and sessions, set orders' user_id to NULL, and delete the user last.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "run",
      label: "Orchestration",
      steps: [
        { caption: "The deletion service records the request as PENDING, starts the 30-day timer and tells the user the timeline.", tween: 800 },
        { caption: "Targets run in priority order: search, files, analytics, third parties, then PostgreSQL, and caches last so nothing refills them. Backups are left to expire.", tween: 3000, ms: 3200 },
        { caption: "Then every system is queried again to confirm the data is gone. A failure leaves the request PARTIALLY_COMPLETED for a retry.", tween: 1000, ms: 3200 },
        { caption: "Finally the audit log records USER_DELETED with an anonymized ID, the user gets a confirmation, and a compliance certificate is generated.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "special",
      label: "Special cases",
      steps: [
        { caption: "You can't remove one user from a backup. Daily backups expire after 30 days, weekly after 90; restore one before then and the pending deletions are re-applied.", tween: 2200, ms: 3400 },
        { caption: "Orders are needed for tax law, so they're anonymized instead: user_id becomes NULL and the address DELETED, kept for 7 years under a legal obligation.", tween: 1400, ms: 3400 },
        { caption: "Shared content keeps its context: messages stay, shown as @deactivateduser, while the profile is deleted. An enterprise legal hold can prevent deletion.", tween: 1400, ms: 3400 },
        { caption: "Audit logs are anonymized, never deleted, and a USER_DELETED record is added. Deleting them would leave no proof.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
