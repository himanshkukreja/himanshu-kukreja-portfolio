/**
 * "Take the course offline" announcement: the installable app + offline reading, with a
 * step-by-step setup guide and screenshots. HTML (table layout, inline styles, 600px, phone-safe)
 * + plain-text twin. Pure function, no I/O: src/lib/campaigns/templates.ts turns it into the
 * "Offline course + app" campaign template, so the admin preview, test sends and the real send all
 * render through here.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots live in public/email/offline-app/ (captured from the live site, iPhone 13, dark theme)
 * and are referenced by absolute URL, so they load only once that folder is deployed.
 *
 * Copy is checked against the shipped UI: SaveOfflineButton (cloud icon, "Saved for offline"),
 * SaveGroupButton ("Save this world offline"), CourseHub ReadOffline card ("Save the entire course",
 * "Offline library", "Install the app"), IosInstallSheet (Share → Add to Home Screen → Add),
 * OfflineStrip ("Offline · saved copy", "Back online"), OfflineLibrary (/learn/offline).
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const OFFLINE_APP_KEY = "announce:offline-app-2026-10";
export const OFFLINE_APP_SUBJECT = "Take System Design Mastery on your next flight";
export function offlineAppSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, take the course on your next flight` : OFFLINE_APP_SUBJECT;
}
export const OFFLINE_APP_PREHEADER = "Install it like an app, save a lesson, a world or the whole course, and read with no internet. Progress syncs when you're back online.";

const SITE = "https://www.himanshukukreja.in";
export const OFFLINE_LINKS = {
  hub: `${SITE}/learn/system-design-mastery`,
  library: `${SITE}/learn/offline`,
  guide: `${SITE}/learn/guide#offline`,
};
const IMG_BASE = `${SITE}/email/offline-app`;

export type OfflineAppInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot / step tile: 528 CSS px wide (the card's content width), 2x files. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  card: { file: "read-offline-card.jpg", w: 528, h: 487, alt: "The Read offline card on the course map: Save the entire course (about 15 MB), Offline library and Install the app, marked 3, 4 and 2." },
  iphone: { file: "install-iphone.png", w: 528, h: 239, alt: "iPhone install in three steps: 1 tap Share in Safari, 2 tap Add to Home Screen then Add, 3 open the new SD Mastery icon." },
  others: { file: "install-android-desktop.png", w: 528, h: 249, alt: "Android: tap Install the app on the course page. Laptop with Chrome or Edge: click the install icon in the address bar." },
  lesson: { file: "save-lesson.jpg", w: 528, h: 331, alt: "A lesson on a phone: 1 the cloud button next to the title, 2 after tapping it, a check mark and a Saved for offline notice." },
  world: { file: "save-world.jpg", w: 528, h: 331, alt: "The course map: 1 tap a world, 2 press Save this world offline at the bottom of the world panel." },
  library: { file: "offline-library.jpg", w: 528, h: 331, alt: "The Offline library page listing what is saved on this device, grouped by world, with sizes and dates." },
  strip: { file: "offline-saved-copy.jpg", w: 528, h: 103, alt: "The line at the top of a page with no internet: Offline · saved copy, with a link to the offline library. Then Back online." },
} satisfies Record<string, Shot>;

type Step = { n: string; title: string; html: string[]; text: string[]; shots: Shot[] };

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;

const STEPS: Step[] = [
  {
    n: "1",
    title: "Open the course",
    html: [
      `Open <a href="${OFFLINE_LINKS.hub}" style="color:${C.signalText};text-decoration:underline;">the course map</a> on the phone or laptop you'll travel with. A little way down is the ${b("Read offline")} card: every button below starts there. The numbers match the steps.`,
    ],
    text: [`Open the course map on the phone or laptop you'll travel with: ${OFFLINE_LINKS.hub}`, "A little way down is the Read offline card: every button below starts there."],
    shots: [SHOTS.card],
  },
  {
    n: "2",
    title: "Install it as an app",
    html: [
      `${b("iPhone or iPad (Safari):")} tap ${b("Share")}, scroll down and tap ${b("Add to Home Screen")}, then ${b("Add")}. Open the course from the new ${b("SD Mastery")} icon. Tapping ${b("Install the app")} on the course page shows the same steps.`,
      `${b("Android:")} tap ${b("Install the app")} on the course page, or open the browser menu and choose ${b("Install app")} (some phones say ${b("Add to Home screen")}).`,
      `${b("Laptop (Chrome or Edge):")} click the install icon at the right end of the address bar, or press ${b("Install the app")}. It opens in its own window with your saved lessons.`,
    ],
    text: [
      "iPhone or iPad (Safari): tap Share, scroll down and tap Add to Home Screen, then Add. Open the course from the new SD Mastery icon. Tapping Install the app on the course page shows the same steps.",
      "Android: tap Install the app on the course page, or open the browser menu and choose Install app (some phones say Add to Home screen).",
      "Laptop (Chrome or Edge): click the install icon at the right end of the address bar, or press Install the app. It opens in its own window with your saved lessons.",
    ],
    shots: [SHOTS.iphone, SHOTS.others],
  },
  {
    n: "3",
    title: "Save what you want to read",
    html: [
      `${b("One lesson:")} tap the cloud button next to the lesson title (it says ${b("Save offline")} on a laptop). It turns into a check mark and ${b("Saved for offline")} pops up. Bosses, side quests, trials, mock interviews and case files have the same button.`,
      `${b("A whole world:")} tap a world on the course map and press ${b("Save this world offline")} at the bottom. It shows the size first.`,
      `${b("Everything:")} press ${b("Save the entire course")} on the Read offline card (about 15 MB). Best on wifi.`,
    ],
    text: [
      "One lesson: tap the cloud button next to the lesson title (it says Save offline on a laptop). It turns into a check mark and Saved for offline pops up. Bosses, side quests, trials, mock interviews and case files have the same button.",
      "A whole world: tap a world on the course map and press Save this world offline at the bottom. It shows the size first.",
      "Everything: press Save the entire course on the Read offline card (about 15 MB). Best on wifi.",
    ],
    shots: [SHOTS.lesson, SHOTS.world],
  },
  {
    n: "4",
    title: "Check your Offline library",
    html: [
      `Press ${b("Offline library")} on the Read offline card (or open <a href="${OFFLINE_LINKS.library}" style="color:${C.signalText};text-decoration:underline;">himanshukukreja.in/learn/offline</a>). It lists everything saved on this device with sizes, lets you update or remove things, and has buttons to save more.`,
    ],
    text: [`Press Offline library on the Read offline card, or open ${OFFLINE_LINKS.library}`, "It lists everything saved on this device with sizes, lets you update or remove things, and has buttons to save more."],
    shots: [SHOTS.library],
  },
  {
    n: "5",
    title: "Go offline",
    html: [
      `Open a saved lesson from its usual link, the course map or the library. A line at the top says ${b("Offline · saved copy")}. Diagrams, code, quick checks, trials, stage clears and XP all work. When you're back online it says ${b("Back online")}, and if you're signed in, the progress you made goes up to your account.`,
    ],
    text: [
      "Open a saved lesson from its usual link, the course map or the library. A line at the top says \"Offline · saved copy\". Diagrams, code, quick checks, trials, stage clears and XP all work.",
      "When you're back online it says \"Back online\", and if you're signed in, the progress you made goes up to your account.",
    ],
    shots: [SHOTS.strip],
  },
];

const TIPS = [
  { title: "Save before you board.", body: "Saving needs a connection; reading doesn't." },
  { title: "On iPhone, save inside the Home Screen app.", body: "Safari can clear a website's saved data after about a week without a visit, and lessons saved in Safari don't carry over into the app. Saved in the app, they stay until you remove them." },
  { title: "The whole course is about 15 MB.", body: "The button shows the size before you start; a single lesson is around 100 KB." },
];

const img = (s: Shot) =>
  `<img src="${IMG_BASE}/${s.file}" width="${s.w}" height="${s.h}" alt="${esc(s.alt)}" style="display:block;width:100%;max-width:${s.w}px;height:auto;border:0;outline:none;text-decoration:none;">`;

const P = (extra = "") => `margin:0 0 10px 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};${extra}`;

function stepHtml(s: Step): string {
  return `
        <tr>
          <td class="pad" style="padding:0 36px 30px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;"><tr>
              <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:${C.signal};font-family:${F_MONO};font-size:13px;font-weight:600;color:${C.onSignal};">${s.n}</td>
              <td style="padding:0 0 0 12px;font-family:${F_DISPLAY};font-weight:800;font-size:20px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};">${esc(s.title)}</td>
            </tr></table>
            ${s.html.map((h) => `<p style="${P()}">${h}</p>`).join("\n            ")}
            ${s.shots.map((x) => `<div style="margin:14px 0 0 0;">${img(x)}</div>`).join("\n            ")}
          </td>
        </tr>`;
}

export function offlineAppHtml({ email, name }: OfflineAppInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const features = [
    { tag: "app", title: "Install it like an app", body: "It opens from your home screen or dock, full screen. No app store." },
    { tag: "save", title: "Save a lesson, a world or everything", body: "One tap per lesson, one button per world, or the entire course in one go." },
    { tag: "offline", title: "Everything works with no internet", body: "Diagrams, code, quick checks, trials and XP. Your progress syncs when you're back online." },
  ]
    .map(
      (f) => `
              <tr>
                <td style="padding:0 0 16px 0;">
                  <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};margin:0 0 4px 0;">${esc(f.tag)}</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:18px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 4px 0;">${esc(f.title)}</div>
                  <div style="font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${esc(f.body)}</div>
                </td>
              </tr>`
    )
    .join("");
  const tips = TIPS.map((t) => `<li style="margin:0 0 8px 0;"><strong style="color:#F3F2EE;">${esc(t.title)}</strong> ${esc(t.body)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(OFFLINE_APP_SUBJECT)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Geist:wght@400;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.signalText}; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:34px !important; }
    .btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(OFFLINE_APP_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu<span style="display:inline-block;width:8px;height:15px;background:${C.signal};margin-left:4px;vertical-align:-2px;">&nbsp;</span></td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · offline + app</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>

        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · free course</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Take the course offline.</h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">A flight, a metro tunnel, hotel wifi that gives up: that's where a lot of reading time goes, and until now the course needed a connection. Not anymore. You can install System Design Mastery like an app and save lessons to read with no internet at all.</p>
          </td>
        </tr>

        <!-- what's new -->
        <tr>
          <td class="pad" style="padding:24px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${features}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="pad btn" style="padding:8px 36px 8px 36px;">
            <a href="${OFFLINE_LINKS.hub}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;border:1px solid ${C.signal};">Open the course →</a>
          </td>
        </tr>

        <!-- steps -->
        <tr>
          <td class="pad" style="padding:28px 36px 0 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 26px 0;">&nbsp;</div>
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};margin:0 0 6px 0;">set it up in two minutes</div>
            <h2 style="margin:0 0 22px 0;font-family:${F_DISPLAY};font-weight:800;font-size:26px;line-height:1.15;letter-spacing:-0.02em;color:${C.ink};">Five steps, before you lose signal</h2>
          </td>
        </tr>
        ${STEPS.map(stepHtml).join("")}

        <!-- tips -->
        <tr>
          <td class="pad" style="padding:0 36px 30px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:20px 22px 12px 22px;">
                  <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};margin:0 0 10px 0;">good to know</div>
                  <ul style="margin:0;padding:0 0 0 18px;font-family:${F_BODY};font-size:14px;line-height:1.55;color:#C9C8C2;">${tips}</ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA again -->
        <tr>
          <td class="pad btn" style="padding:0 36px 12px 36px;">
            <a href="${OFFLINE_LINKS.hub}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;border:1px solid ${C.signal};">Save the course for offline →</a>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:0 36px 30px 36px;">
            <p style="margin:0;font-family:${F_MONO};font-size:13px;line-height:1.6;color:${C.ink3};">or open your <a href="${OFFLINE_LINKS.library}" style="color:${C.signalText};text-decoration:underline;">offline library</a> · the full <a href="${OFFLINE_LINKS.guide}" style="color:${C.signalText};text-decoration:underline;">offline guide</a></p>
          </td>
        </tr>

        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Try it on your next trip and tell me how it went. If a lesson didn't open offline or something looks off, just reply to this email. I read every reply.</p>
            <p style="margin:16px 0 0 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink};">Himanshu</p>
            <p style="margin:2px 0 0 0;font-family:${F_MONO};font-size:12px;color:${C.ink3};"><a href="${SITE}" style="color:${C.ink3};text-decoration:none;">himanshukukreja.in</a></p>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td class="pad" style="padding:18px 36px 22px 36px;border-top:1px solid ${C.line};background:${C.paper};">
            <p style="margin:0;font-family:${F_BODY};font-size:12px;line-height:1.6;color:${C.ink3};">You're getting this course update because you signed up at himanshukukreja.in/learn with ${esc(email)}. <a href="${unsub}" style="color:${C.ink3};text-decoration:underline;">Unsubscribe</a> and you won't get course or newsletter emails again.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function offlineAppText({ email, name }: OfflineAppInput): string {
  const hi = firstName(name);
  const lines = [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    "A flight, a metro tunnel, hotel wifi that gives up: that's where a lot of reading time goes, and until now the course needed a connection. Not anymore. You can install System Design Mastery like an app and save lessons to read with no internet at all.",
    "",
    "- Install it like an app: it opens from your home screen or dock, full screen. No app store.",
    "- Save a lesson, a world or everything: one tap per lesson, one button per world, or the entire course in one go.",
    "- Everything works with no internet: diagrams, code, quick checks, trials and XP. Your progress syncs when you're back online.",
    "",
    `Open the course: ${OFFLINE_LINKS.hub}`,
    "",
    "SET IT UP IN TWO MINUTES",
    "",
    ...STEPS.flatMap((s) => [`${s.n}. ${s.title.toUpperCase()}`, ...s.text, ""]),
    "GOOD TO KNOW",
    ...TIPS.map((t) => `- ${t.title} ${t.body}`),
    "",
    `Save the course for offline: ${OFFLINE_LINKS.hub}`,
    `Your offline library: ${OFFLINE_LINKS.library}`,
    `The full offline guide: ${OFFLINE_LINKS.guide}`,
    "",
    "Try it on your next trip and tell me how it went. If a lesson didn't open offline or something looks off, just reply to this email. I read every reply.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ];
  return lines.join("\n");
}

export function offlineAppEmail(input: OfflineAppInput) {
  return { subject: offlineAppSubject(input.name), html: offlineAppHtml(input), text: offlineAppText(input) };
}
