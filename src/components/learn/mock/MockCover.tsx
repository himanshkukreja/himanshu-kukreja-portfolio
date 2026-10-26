/**
 * Mock interview covers: a "whiteboard" figure per mock, drawn in the platform's blueprint style (grid,
 * mono labels, one orange accent) from theme tokens, so it follows light and dark mode. Each scene hints
 * at the problem without giving the design away; the two figures come from the mock's own brief/problem.
 * Keyed by the mock's front matter id; an unknown id gets the generic interview-room figure.
 */
import type { ReactNode } from "react";

const C = {
  sig: "var(--c-signal)",
  fg: "var(--c-fg)",
  fg2: "var(--c-fg-2)",
  fg3: "var(--c-fg-3)",
  fg4: "var(--c-fg-4)",
  line: "var(--c-line)",
  ls: "var(--c-line-strong)",
  s2: "var(--c-surface-2)",
  surf: "var(--c-surface)",
};
const DISPLAY = "var(--font-display), ui-sans-serif, system-ui, sans-serif";

type Scene = { tag: string; stats: [[string, string], [string, string]]; foot: string; draw: () => ReactNode };

/** a labelled box */
function Box({ x, y, w, h, label, hot = false, size = 10 }: { x: number; y: number; w: number; h: number; label?: string; hot?: boolean; size?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={hot ? "color-mix(in srgb, var(--c-signal) 14%, transparent)" : C.s2} stroke={hot ? C.sig : C.ls} strokeWidth={1.2} />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + size * 0.36} textAnchor="middle" fontSize={size} letterSpacing={1.2} fill={hot ? C.sig : C.fg2}>
          {label}
        </text>
      )}
    </g>
  );
}

const Arrow = ({ d, hot = false, dash = false }: { d: string; hot?: boolean; dash?: boolean }) => (
  <path d={d} fill="none" stroke={hot ? C.sig : C.ls} strokeWidth={1.3} strokeDasharray={dash ? "4 4" : undefined} markerEnd={`url(#${hot ? "mc-ah" : "mc-a"})`} />
);

const SCENES: Record<string, Scene> = {
  // Billbolt · bill payments and AutoPay
  "mock-01": {
    tag: "AUTOPAY",
    stats: [["30M", "Indians paying bills"], ["20,000", "billers via BillHub"]],
    foot: "MANDATES · DUE DATES · BILLHUB · PAYGATE · RETRIES",
    draw: () => (
      <g>
        <text x={40} y={76} fontSize={10} letterSpacing={1.5} fill={C.fg3}>
          THIS MONTH
        </text>
        {Array.from({ length: 35 }, (_, i) => {
          const due = [4, 11, 19, 27].includes(i);
          return <rect key={i} x={40 + (i % 7) * 30} y={86 + Math.floor(i / 7) * 26} width={26} height={22} fill={due ? "color-mix(in srgb, var(--c-signal) 22%, transparent)" : "none"} stroke={due ? C.sig : C.line} strokeWidth={1} />;
        })}
        <text x={40 + 4 * 30 + 13} y={86 + 15} textAnchor="middle" fontSize={8} fill={C.sig}>
          AUTO
        </text>
        <Arrow d="M262 150 H316" hot />
        <Box x={320} y={126} w={120} h={48} label="BILLHUB" hot size={11} />
        <Arrow d="M440 150 C470 150 470 98 494 98" />
        <Arrow d="M440 150 H494" />
        <Arrow d="M440 150 C470 150 470 202 494 202" />
        <Box x={498} y={80} w={112} h={36} label="ELECTRICITY" size={9} />
        <Box x={498} y={132} w={112} h={36} label="MOBILE" size={9} />
        <Box x={498} y={184} w={112} h={36} label="BROADBAND" size={9} />
      </g>
    ),
  },
  // Wanderstay · stays booking and availability
  "mock-02": {
    tag: "BOOKINGS",
    stats: [["90", "countries"], ["24 h", "for a host to accept"]],
    foot: "SEARCH · NIGHTS · HOLD · PAY · CONFIRM · CHANNEL MANAGER",
    draw: () => (
      <g>
        <path d="M50 150 L120 92 L190 150" fill="none" stroke={C.fg2} strokeWidth={1.6} />
        <rect x={64} y={150} width={112} height={92} fill={C.s2} stroke={C.fg2} strokeWidth={1.6} />
        <rect x={108} y={196} width={24} height={46} fill="none" stroke={C.sig} strokeWidth={1.4} />
        {["FRI", "SAT", "SUN", "MON", "TUE", "WED", "THU"].map((d, i) => {
          const booked = i >= 1 && i <= 3;
          return (
            <g key={d}>
              <text x={252 + i * 52 + 21} y={92} textAnchor="middle" fontSize={9} letterSpacing={1} fill={C.fg3}>
                {d}
              </text>
              <rect x={252 + i * 52} y={100} width={42} height={42} fill={booked ? "color-mix(in srgb, var(--c-signal) 22%, transparent)" : "none"} stroke={booked ? C.sig : C.ls} strokeWidth={1.2} />
            </g>
          );
        })}
        <path d="M304 152 v8 h146 v-8" fill="none" stroke={C.sig} strokeWidth={1.2} />
        <text x={377} y={176} textAnchor="middle" fontSize={10} letterSpacing={1.4} fill={C.sig}>
          3 NIGHTS
        </text>
        <Box x={252} y={210} w={150} h={40} label="WANDERSTAY" hot />
        <Box x={470} y={210} w={140} h={40} label="OTHER SITES" />
        <Arrow d="M404 222 H466" />
        <Arrow d="M468 238 H406" />
        <text x={436} y={270} textAnchor="middle" fontSize={8} letterSpacing={1.2} fill={C.fg3}>
          CHANNEL MANAGER
        </text>
      </g>
    ),
  },
  // Kaamkaaj · job search, alerts and recruiter analytics
  "mock-03": {
    tag: "JOB SEARCH",
    stats: [["60M", "job seekers"], ["3M", "live jobs"]],
    foot: "SEARCH · AUTOCOMPLETE · SAVED SEARCHES · ALERTS · ANALYTICS",
    draw: () => (
      <g>
        <rect x={40} y={70} width={330} height={40} fill={C.s2} stroke={C.ls} strokeWidth={1.2} />
        <circle cx={60} cy={89} r={7} fill="none" stroke={C.fg3} strokeWidth={1.4} />
        <path d="M65 94 l6 6" stroke={C.fg3} strokeWidth={1.4} />
        <text x={80} y={94} fontSize={12} fill={C.fg}>
          backend engineer · pune
        </text>
        <rect x={262} y={81} width={1.5} height={16} fill={C.sig} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={40} y={124 + i * 50} width={330} height={40} fill="none" stroke={i === 0 ? C.sig : C.line} strokeWidth={1.2} />
            <rect x={54} y={134 + i * 50} width={150 - i * 20} height={7} fill={i === 0 ? C.fg2 : C.ls} />
            <rect x={54} y={148 + i * 50} width={96} height={5} fill={C.line} />
            {i === 0 && (
              <text x={354} y={149} textAnchor="end" fontSize={9} letterSpacing={1.2} fill={C.sig}>
                NEW
              </text>
            )}
          </g>
        ))}
        <path d="M430 104 q0 -26 22 -26 q22 0 22 26 v10 l6 8 h-56 l6 -8 z" fill="none" stroke={C.fg2} strokeWidth={1.5} />
        <circle cx={474} cy={80} r={7} fill={C.sig} />
        {[
          ["IMPR", 120, false],
          ["VIEWS", 66, false],
          ["APPLIES", 24, true],
        ].map(([l, h, hot], i) => (
          <g key={l as string}>
            <rect x={430 + i * 60} y={296 - (h as number)} width={38} height={h as number} fill={hot ? C.sig : C.s2} stroke={hot ? C.sig : C.ls} />
            <text x={449 + i * 60} y={312} textAnchor="middle" fontSize={8} letterSpacing={1} fill={C.fg3}>
              {l}
            </text>
          </g>
        ))}
      </g>
    ),
  },
  // Tillsy · offline-first POS
  "mock-04": {
    tag: "POINT OF SALE",
    stats: [["3 days", "billing offline"], ["3", "regions: IN · EU · SEA"]],
    foot: "OFFLINE BILLING · SYNC · MENUS · TAXES · LIVE SALES",
    draw: () => (
      <g>
        <rect x={50} y={78} width={200} height={140} fill={C.s2} stroke={C.fg2} strokeWidth={1.6} />
        <rect x={130} y={218} width={40} height={14} fill={C.ls} />
        <rect x={110} y={232} width={80} height={6} fill={C.ls} />
        <text x={66} y={102} fontSize={10} letterSpacing={1.2} fill={C.fg3}>
          BILL #0412
        </text>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={66} y={114 + i * 18} width={100 - i * 12} height={6} fill={C.line} />
            <rect x={206} y={114 + i * 18} width={28} height={6} fill={C.line} />
          </g>
        ))}
        <rect x={66} y={190} width={168} height={14} fill="color-mix(in srgb, var(--c-signal) 20%, transparent)" stroke={C.sig} />
        <g transform="translate(282 92)" stroke={C.sig} strokeWidth={1.6} fill="none">
          <path d="M0 14 q20 -18 40 0" />
          <path d="M7 22 q13 -11 26 0" />
          <circle cx={20} cy={30} r={2.5} fill={C.sig} />
          <path d="M-2 -2 L42 38" />
        </g>
        <path d="M262 170 C340 170 360 140 440 140" fill="none" stroke={C.ls} strokeWidth={1.3} strokeDasharray="4 5" />
        {[300, 340, 380].map((x, i) => (
          <rect key={x} x={x} y={157 - i * 8} width={12} height={12} fill={C.surf} stroke={C.sig} strokeWidth={1.2} />
        ))}
        <path d="M456 156 a26 26 0 0 1 8 -50 a34 34 0 0 1 64 -6 a24 24 0 0 1 30 26 a20 20 0 0 1 -4 30 z" fill={C.s2} stroke={C.fg2} strokeWidth={1.5} />
        {["IN", "EU", "SEA"].map((r, i) => (
          <Box key={r} x={452 + i * 52} y={196} w={44} h={26} label={r} size={9} hot={i === 0} />
        ))}
      </g>
    ),
  },
  // Paisly · phone OTP sign-in and sessions
  "mock-05": {
    tag: "SIGN-IN",
    stats: [["25M", "users"], ["6-digit", "OTP by SMS"]],
    foot: "OTP · RATE LIMITS · TWO SMS PROVIDERS · DEVICE BINDING · SESSIONS",
    draw: () => (
      <g>
        <rect x={60} y={66} width={132} height={238} fill={C.s2} stroke={C.fg2} strokeWidth={1.6} />
        <rect x={108} y={74} width={36} height={5} fill={C.ls} />
        <text x={126} y={140} textAnchor="middle" fontSize={9} letterSpacing={1.4} fill={C.fg3}>
          ENTER OTP
        </text>
        {["4", "8", "2", "9", "1", ""].map((d, i) => (
          <g key={i}>
            <rect x={71 + i * 19} y={152} width={15} height={22} fill="none" stroke={i === 5 ? C.sig : C.ls} strokeWidth={1.2} />
            <text x={78.5 + i * 19} y={168} textAnchor="middle" fontSize={12} fill={C.fg}>
              {d}
            </text>
          </g>
        ))}
        <rect x={80} y={196} width={92} height={24} fill={C.sig} />
        <text x={126} y={212} textAnchor="middle" fontSize={9} letterSpacing={1.4} fill="var(--c-on-signal)">
          VERIFY
        </text>
        {[
          [360, "DAKIYA", true],
          [480, "SANDESHNET", false],
        ].map(([x, l, hot]) => (
          <g key={l as string}>
            <path d={`M${x} 120 l-16 64 M${x} 120 l16 64 M${(x as number) - 10} 160 h20`} stroke={hot ? C.sig : C.fg2} strokeWidth={1.5} fill="none" />
            <path d={`M${(x as number) - 14} 108 a18 18 0 0 1 28 0 M${(x as number) - 22} 100 a28 28 0 0 1 44 0`} stroke={hot ? C.sig : C.ls} strokeWidth={1.3} fill="none" />
            <text x={x as number} y={204} textAnchor="middle" fontSize={9} letterSpacing={1.2} fill={hot ? C.sig : C.fg3}>
              {l}
            </text>
          </g>
        ))}
        <Arrow d="M342 140 C290 140 250 160 198 162" hot dash />
        <Arrow d="M466 150 C420 230 300 230 198 182" dash />
        <Box x={360} y={248} w={150} h={34} label="DEVICE BOUND" size={9} />
      </g>
    ),
  },
  // Cartwala · flash-sale catalog and prices
  "mock-06": {
    tag: "NOON DROP",
    stats: [["200,000", "products repriced"], ["2 h", "sale window"]],
    foot: "CATALOG · PRICES · CACHE · 12:00:00 · CHECKOUT RE-PRICES",
    draw: () => (
      <g>
        <text x={40} y={84} fontSize={10} letterSpacing={1.6} fill={C.sig}>
          NOON DROP
        </text>
        <text x={38} y={140} fontSize={52} fontFamily={DISPLAY} fontWeight={800} letterSpacing={-1} fill={C.fg}>
          12:00:00
        </text>
        <path d="M44 176 h150 l26 30 l-26 30 h-150 z" fill={C.s2} stroke={C.ls} strokeWidth={1.3} />
        <circle cx={196} cy={206} r={4} fill="none" stroke={C.fg3} />
        <text x={58} y={200} fontSize={12} fill={C.fg3}>
          ₹17,999
        </text>
        <path d="M56 196 h58" stroke={C.fg3} strokeWidth={1.2} />
        <text x={58} y={226} fontSize={22} fontFamily={DISPLAY} fontWeight={800} fill={C.sig}>
          ₹9,999
        </text>
        <path d="M330 300 V80 M330 300 H612" stroke={C.ls} strokeWidth={1.2} fill="none" />
        <path d="M470 84 V300" stroke={C.sig} strokeWidth={1} strokeDasharray="3 4" />
        <text x={476} y={96} fontSize={9} letterSpacing={1} fill={C.sig}>
          12:00:00
        </text>
        <path d="M334 284 L370 282 L410 283 L450 280 L466 276 L474 110 L490 150 L520 196 L560 224 L608 236" fill="none" stroke={C.sig} strokeWidth={2} />
        <text x={336} y={316} fontSize={8} letterSpacing={1} fill={C.fg3}>
          READS / SECOND
        </text>
      </g>
    ),
  },
  // Sunwaai · support desk, ticket search and SLAs
  "mock-07": {
    tag: "SUPPORT DESK",
    stats: [["9,000", "brands"], ["4", "channels in"]],
    foot: "TICKETS · ASSIGNMENT · SLAS · ESCALATIONS · SEARCH · NOTIFICATIONS",
    draw: () => (
      <g>
        {["EMAIL", "CHAT", "WHATSAPP", "PHONE"].map((l, i) => (
          <g key={l}>
            <Box x={40} y={74 + i * 46} w={104} h={30} label={l} size={9} />
            <Arrow d={`M144 ${89 + i * 46} C176 ${89 + i * 46} 176 170 206 170`} />
          </g>
        ))}
        {[2, 1, 0].map((k) => (
          <rect key={k} x={212 + k * 8} y={120 - k * 8} width={150} height={104} fill={C.s2} stroke={k === 0 ? C.fg2 : C.ls} strokeWidth={1.3} />
        ))}
        <text x={226} y={144} fontSize={10} letterSpacing={1.2} fill={C.fg3}>
          TICKET #48213
        </text>
        <rect x={226} y={156} width={110} height={6} fill={C.line} />
        <rect x={226} y={170} width={84} height={6} fill={C.line} />
        <rect x={226} y={194} width={56} height={16} fill="color-mix(in srgb, var(--c-signal) 20%, transparent)" stroke={C.sig} />
        <text x={254} y={205} textAnchor="middle" fontSize={8} letterSpacing={1} fill={C.sig}>
          DELIVERY
        </text>
        <rect x={398} y={74} width={212} height={36} fill={C.s2} stroke={C.ls} strokeWidth={1.2} />
        <text x={412} y={96} fontSize={11} fill={C.fg}>
          refund delayed
        </text>
        <g transform="translate(582 82)" stroke={C.sig} strokeWidth={1.4} fill="none">
          <rect x={0} y={8} width={14} height={11} />
          <path d="M3 8 v-3 a4 4 0 0 1 8 0 v3" />
        </g>
        <circle cx={504} cy={214} r={48} fill="none" stroke={C.line} strokeWidth={8} />
        <path d="M504 166 A48 48 0 1 1 456.6 222" fill="none" stroke={C.sig} strokeWidth={8} />
        <text x={504} y={210} textAnchor="middle" fontSize={10} letterSpacing={1.4} fill={C.fg3}>
          SLA
        </text>
        <text x={504} y={228} textAnchor="middle" fontSize={10} letterSpacing={1} fill={C.fg}>
          FIRST REPLY
        </text>
      </g>
    ),
  },
  // Switchyard · multi-tenant feature flags and experiments
  "mock-08": {
    tag: "FEATURE FLAGS",
    stats: [["4,000", "engineering teams"], ["billions", "evaluations a day"]],
    foot: "FLAGS · TARGETING · ROLLOUTS · EXPERIMENTS · TENANTS · SDKS",
    draw: () => (
      <g>
        {[
          ["new-checkout", true, 0.1, "10%"],
          ["dark-mode", true, 1, "100%"],
          ["kill-payments", false, 0, "OFF"],
        ].map(([name, on, p, l], i) => {
          const y = 84 + i * 62;
          return (
            <g key={name as string}>
              <text x={40} y={y + 15} fontSize={12} fill={C.fg}>
                {name as string}
              </text>
              <rect x={190} y={y} width={44} height={22} rx={11} fill={on ? C.sig : C.s2} stroke={on ? C.sig : C.ls} />
              <circle cx={on ? 223 : 201} cy={y + 11} r={8} fill={on ? "var(--c-on-signal)" : C.fg3} />
              <rect x={250} y={y + 7} width={110} height={8} fill={C.s2} stroke={C.line} />
              <rect x={250} y={y + 7} width={110 * (p as number)} height={8} fill={C.sig} />
              <text x={368} y={y + 15} fontSize={9} letterSpacing={1} fill={i === 2 ? C.sig : C.fg3}>
                {l as string}
              </text>
            </g>
          );
        })}
        <Box x={420} y={146} w={70} h={40} label="RULES" hot />
        {["IOS", "ANDROID", "WEB", "SERVER"].map((s, i) => (
          <g key={s}>
            <Arrow d={`M490 166 C512 166 512 ${92 + i * 50} 530 ${92 + i * 50}`} />
            <Box x={534} y={78 + i * 50} w={76} h={28} label={s} size={9} />
          </g>
        ))}
      </g>
    ),
  },
};

export default function MockCover({ id, n, company, className = "" }: { id: string; n: number; company: string; className?: string }) {
  const s = SCENES[id];
  if (!s) return null;
  const gid = `mc-grid-${id}`;
  return (
    <svg viewBox="0 0 640 420" role="img" aria-label={`Whiteboard sketch: ${company}, ${s.tag.toLowerCase()}`} className={`h-auto w-full font-mono ${className}`}>
      <defs>
        <pattern id={gid} width={20} height={20} patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={C.line} strokeWidth={0.6} />
        </pattern>
        <marker id="mc-a" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={C.ls} />
        </marker>
        <marker id="mc-ah" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={C.sig} />
        </marker>
      </defs>
      <rect width={640} height={420} fill={C.surf} />
      <rect width={640} height={420} fill={`url(#${gid})`} opacity={0.7} />
      <rect x={0.5} y={0.5} width={639} height={419} fill="none" stroke={C.ls} />
      <text x={20} y={30} fontSize={11} letterSpacing={1.6} fill={C.sig}>
        {`M${n} · ${company.toUpperCase()} · ${s.tag}`}
      </text>
      <text x={620} y={30} textAnchor="end" fontSize={11} letterSpacing={1.6} fill={C.fg3}>
        FIG. 1 · WHITEBOARD
      </text>
      <path d="M0 44 H640" stroke={C.ls} />
      {s.draw()}
      <text x={24} y={354} fontSize={28} fontFamily={DISPLAY} fontWeight={800} letterSpacing={-0.5} fill={C.fg}>
        {s.stats[0][0]}
      </text>
      <text x={24} y={372} fontSize={9} letterSpacing={1.5} fill={C.fg3}>
        {s.stats[0][1].toUpperCase()}
      </text>
      <text x={616} y={354} textAnchor="end" fontSize={28} fontFamily={DISPLAY} fontWeight={800} letterSpacing={-0.5} fill={C.sig}>
        {s.stats[1][0]}
      </text>
      <text x={616} y={372} textAnchor="end" fontSize={9} letterSpacing={1.5} fill={C.fg3}>
        {s.stats[1][1].toUpperCase()}
      </text>
      <path d="M0 386 H640" stroke={C.line} />
      <text x={20} y={406} fontSize={9} letterSpacing={1.6} fill={C.fg4}>
        {s.foot}
      </text>
    </svg>
  );
}

export const hasMockCover = (id: string) => id in SCENES;
