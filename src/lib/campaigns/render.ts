/**
 * Campaign email renderer. Pure + client-safe: the composer's live preview, the test send and the
 * real send all go through `renderEmail`, so the preview is exactly what a recipient gets.
 *
 * Two document kinds:
 *   blocks: editable content blocks (markdown text, buttons, features, callouts, raw HTML…) inside
 *           the site's email layout (black top bar, orange rule, 600px card, unsubscribe footer).
 *   raw:    a complete HTML email + plain-text twin (the learn-revamp and welcome templates are
 *           generated from their source modules this way so they stay pixel-identical).
 *
 * Pipeline: blocks → HTML with merge tags → tags resolved (values HTML-escaped) → own-domain links
 * get UTM params → allowed links wrapped for click tracking → open pixel before </body>.
 */
import { CONTROL_RE, MergeVars, TAG_RE, hasEmptyTag, resolveTags } from "./tags";
import { allowedUrl, clickUrl, isOwnUrl, openPixelUrl } from "./links";

/* ───────────────────────────── document model ───────────────────────────── */

export type Block =
  | { id: string; type: "hero"; eyebrow: string; title: string }
  | { id: string; type: "text"; md: string }
  | { id: string; type: "button"; label: string; url: string }
  | { id: string; type: "feature"; tag: string; title: string; md: string }
  | { id: string; type: "callout"; eyebrow: string; title: string; label: string; url: string }
  | { id: string; type: "image"; src: string; alt: string; href: string }
  | { id: string; type: "divider" }
  | { id: string; type: "html"; html: string };

export type BlockType = Block["type"];

/** Set on "Case file update" documents: which story the email announces (tracking + the picker). */
export type StoryRef = { slug: string; caseId: string; title: string };
export type BlocksDoc = { layout: "blocks"; topLabel: string; footer: string; blocks: Block[]; story?: StoryRef };
export type RawDoc = { layout: "raw"; html: string; text: string; source?: string };
export type EmailDoc = BlocksDoc | RawDoc;

export type EmailContent = { subject: string; subjectFallback?: string | null; preheader?: string | null; doc: EmailDoc };

export type RenderOptions = {
  /** Public base URL for pixel + click links (https://www.himanshukukreja.in). */
  base: string;
  /** Per-recipient token; "preview"/"test" render the same markup but the routes ignore them. */
  token?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
  /** utm_campaign added to own-domain links that have no utm_* params yet. */
  utmCampaign?: string | null;
  /** extra hosts allowed for click wrapping (EMAIL_CLICK_HOSTS) */
  extraHosts?: string[];
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Heading",
  text: "Text (markdown)",
  button: "Button",
  feature: "Feature",
  callout: "Dark callout",
  image: "Image",
  divider: "Divider",
  html: "Raw HTML",
};

/** Every editable string in a document, labelled (validation + tag checks). */
export function docFields(doc: EmailDoc): { where: string; value: string }[] {
  if (doc.layout === "raw")
    return [
      { where: "HTML", value: doc.html },
      { where: "Plain text", value: doc.text },
    ];
  const out = [
    { where: "Top bar label", value: doc.topLabel },
    { where: "Footer", value: doc.footer },
  ];
  doc.blocks.forEach((b, i) => {
    const at = `Block ${i + 1} · ${BLOCK_LABELS[b.type]}`;
    for (const [k, v] of Object.entries(b)) if (k !== "id" && k !== "type" && typeof v === "string") out.push({ where: `${at} · ${k}`, value: v });
  });
  return out;
}

/* ───────────────────────────── design tokens (light, email-safe) ───────────────────────────── */

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000", code: "#F1EFE9" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ───────────────────────────── tiny markdown (email-safe) ───────────────────────────── */

const P_STYLE = `margin:0 0 14px 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};`;

/** Hide merge tags from the markdown parser (underscores in {{first_name}} are not emphasis). */
function protect(s: string) {
  const tags: string[] = [];
  const out = s.replace(new RegExp(`${TAG_RE.source}|${CONTROL_RE.source}`, "g"), (m) => {
    tags.push(m);
    return `\u0000${tags.length - 1}\u0000`;
  });
  return { out, restore: (t: string) => t.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => tags[Number(i)] ?? "") };
}

const safeHref = (u: string) => /^(https?:\/\/|mailto:|\u0000\d+\u0000)/i.test(u.trim());

function inlineHtml(s: string, linkColor = C.signalText): string {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, `<code style="font-family:${F_MONO};font-size:0.92em;background:${C.code};padding:1px 4px;">$1</code>`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) =>
    safeHref(url) ? `<a href="${url}" style="color:${linkColor};text-decoration:underline;">${text}</a>` : text
  );
  t = t.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${C.ink};">$1</strong>`);
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return t.replace(/\n/g, "<br>");
}

function inlineText(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => (text.trim() === url.trim() ? url : `${text} (${url})`))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
}

type MdNode = { kind: "p" | "h" | "ul" | "ol" | "quote"; lines: string[] };

function mdBlocks(md: string): MdNode[] {
  const nodes: MdNode[] = [];
  for (const chunk of md.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim().length);
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) nodes.push({ kind: "ul", lines: lines.map((l) => l.replace(/^\s*[-*]\s+/, "")) });
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) nodes.push({ kind: "ol", lines: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) });
    else if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) nodes.push({ kind: "h", lines: [lines[0].replace(/^#{1,3}\s+/, "")] });
    else if (lines.every((l) => /^>\s?/.test(l))) nodes.push({ kind: "quote", lines: lines.map((l) => l.replace(/^>\s?/, "")) });
    else nodes.push({ kind: "p", lines });
  }
  return nodes;
}

export function markdownToHtml(md: string): string {
  const { out, restore } = protect(md);
  const html = mdBlocks(out)
    .map((n) => {
      if (n.kind === "h") return `<h2 style="margin:6px 0 10px 0;font-family:${F_DISPLAY};font-weight:800;font-size:22px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};">${inlineHtml(n.lines[0])}</h2>`;
      if (n.kind === "ul" || n.kind === "ol") {
        const tag = n.kind;
        return `<${tag} style="margin:0 0 14px 0;padding:0 0 0 22px;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${n.lines.map((l) => `<li style="margin:0 0 6px 0;">${inlineHtml(l)}</li>`).join("")}</${tag}>`;
      }
      if (n.kind === "quote") return `<div style="margin:0 0 14px 0;padding:2px 0 2px 14px;border-left:3px solid ${C.signal};font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${inlineHtml(n.lines.join("\n"))}</div>`;
      return `<p style="${P_STYLE}">${inlineHtml(n.lines.join("\n"))}</p>`;
    })
    .join("\n");
  return restore(html);
}

export function markdownToText(md: string): string {
  const { out, restore } = protect(md);
  const text = mdBlocks(out)
    .map((n) => {
      if (n.kind === "h") return inlineText(n.lines[0]).toUpperCase();
      if (n.kind === "ul") return n.lines.map((l) => `- ${inlineText(l)}`).join("\n");
      if (n.kind === "ol") return n.lines.map((l, i) => `${i + 1}. ${inlineText(l)}`).join("\n");
      if (n.kind === "quote") return n.lines.map((l) => `> ${inlineText(l)}`).join("\n");
      return inlineText(n.lines.join("\n"));
    })
    .join("\n\n");
  return restore(text);
}

/* ───────────────────────────── blocks → HTML / text ───────────────────────────── */

function blockHtml(b: Block): string {
  switch (b.type) {
    case "hero":
      return `${b.eyebrow ? `<div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">${esc(b.eyebrow)}</div>` : ""}<h1 class="h1" style="margin:0 0 6px 0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">${esc(b.title)}</h1>`;
    case "text":
      return markdownToHtml(b.md);
    case "button":
      return `<div class="btn"><a href="${esc(b.url)}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;border:1px solid ${C.signal};">${esc(b.label)}</a></div>`;
    case "feature":
      return `<div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};margin:0 0 6px 0;">${esc(b.tag)}</div><div style="font-family:${F_DISPLAY};font-weight:800;font-size:19px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 6px 0;">${esc(b.title)}</div>${markdownToHtml(b.md).replace(/font-size:16px/g, "font-size:15px")}`;
    case "callout":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};"><tr><td style="padding:20px 22px;">${b.eyebrow ? `<div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};margin:0 0 6px 0;">${esc(b.eyebrow)}</div>` : ""}<div style="font-family:${F_DISPLAY};font-weight:800;font-size:20px;line-height:1.3;color:#F3F2EE;margin:0 0 12px 0;">${esc(b.title)}</div>${b.url && b.label ? `<a href="${esc(b.url)}" style="font-family:${F_MONO};font-size:13px;font-weight:600;color:${C.signal};text-decoration:none;">${esc(b.label)}</a>` : ""}</td></tr></table>`;
    case "image": {
      if (!b.src) return "";
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="528" style="display:block;width:100%;max-width:528px;height:auto;border:1px solid ${C.line};">`;
      return b.href ? `<a href="${esc(b.href)}">${img}</a>` : img;
    }
    case "divider":
      return `<div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;">&nbsp;</div>`;
    case "html":
      return b.html;
  }
}

function blockText(b: Block): string {
  switch (b.type) {
    case "hero":
      return b.title.toUpperCase();
    case "text":
      return markdownToText(b.md);
    case "button":
      return `${b.label.replace(/\s*→\s*$/, "")}: ${b.url}`;
    case "feature":
      return `${b.title.toUpperCase()}\n${markdownToText(b.md)}`;
    case "callout":
      return `${b.eyebrow ? `${b.eyebrow.toUpperCase()}\n` : ""}${b.title}${b.url ? `\n${b.label.replace(/\s*→\s*$/, "") || "Open"}: ${b.url}` : ""}`;
    case "image":
      return b.alt ? `[${b.alt}]${b.href ? ` ${b.href}` : ""}` : "";
    case "divider":
      return "—";
    case "html":
      return b.html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
  }
}

function blocksHtml(doc: BlocksDoc, subject: string, preheader: string): string {
  const rows = doc.blocks
    .map((b, i) => {
      const first = i === 0;
      const last = i === doc.blocks.length - 1;
      const top = first ? 36 : b.type === "divider" ? 6 : 0;
      const bottom = last ? 34 : b.type === "divider" ? 26 : b.type === "button" ? 30 : 22;
      const inner = blockHtml(b);
      if (!inner) return "";
      return `
        <tr>
          <td class="pad${b.type === "button" ? " btn" : ""}" style="padding:${top}px 36px ${bottom}px 36px;">${inner}</td>
        </tr>`;
    })
    .join("");
  const footer = doc.footer.trim();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Geist:wght@400;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.signalText}; }
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:34px !important; }
    .btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu<span style="display:inline-block;width:8px;height:15px;background:${C.signal};margin-left:4px;vertical-align:-2px;">&nbsp;</span></td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">${esc(doc.topLabel || "newsletter")}</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        ${rows}
        <tr>
          <td class="pad" style="padding:18px 36px 22px 36px;border-top:1px solid ${C.line};background:${C.paper};">
            <p style="margin:0;font-family:${F_BODY};font-size:12px;line-height:1.6;color:${C.ink3};">${footer ? `${inlineHtml(footer, C.ink3)} ` : ""}<a href="{{unsubscribe_url}}" style="color:${C.ink3};text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function blocksText(doc: BlocksDoc): string {
  const parts = doc.blocks.map(blockText).filter((s) => s.trim());
  const footer = doc.footer.trim() ? inlineText(doc.footer.trim()) : "";
  return `${parts.join("\n\n")}\n\n--\n${footer ? `${footer}\n` : ""}Unsubscribe: {{unsubscribe_url}}`;
}

/* ───────────────────────────── tracking + UTM ───────────────────────────── */

const decodeAttr = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function rewriteLinks(html: string, opts: RenderOptions): string {
  const wrap = !!(opts.trackClicks && opts.token);
  if (!wrap && !opts.utmCampaign) return html;
  return html.replace(/(<a\b[^>]*?\shref=)(["'])(.*?)\2/gi, (m, pre: string, q: string, href: string) => {
    const raw = decodeAttr(href.trim());
    const u = allowedUrl(raw, opts.extraHosts);
    if (!u) return m;
    if (u.pathname.startsWith("/newsletter/unsubscribe") || u.pathname.startsWith("/api/email/")) return m;
    if (opts.utmCampaign && isOwnUrl(u) && ![...u.searchParams.keys()].some((k) => k.startsWith("utm_"))) {
      u.searchParams.set("utm_source", "email");
      u.searchParams.set("utm_medium", "email");
      u.searchParams.set("utm_campaign", opts.utmCampaign);
    }
    const target = wrap ? clickUrl(opts.base, opts.token!, u.toString()) : u.toString();
    return `${pre}${q}${esc(target)}${q}`;
  });
}

function injectPixel(html: string, opts: RenderOptions): string {
  if (!opts.trackOpens || !opts.token) return html;
  const img = `<img src="${esc(openPixelUrl(opts.base, opts.token))}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${img}\n</body>`) : `${html}${img}`;
}

/* ───────────────────────────── entry point ───────────────────────────── */

export type Rendered = { subject: string; html: string; text: string };

export function renderSubject(c: Pick<EmailContent, "subject" | "subjectFallback">, vars: MergeVars): string {
  const useFallback = !!c.subjectFallback?.trim() && hasEmptyTag(c.subject, vars);
  return resolveTags(useFallback ? c.subjectFallback!.trim() : c.subject, vars, "text").replace(/\s+/g, " ").trim();
}

export function renderEmail(c: EmailContent, vars: MergeVars, opts: RenderOptions): Rendered {
  const subject = renderSubject(c, vars);
  const preheader = resolveTags(c.preheader || "", vars, "text");
  const doc = c.doc;
  const htmlTpl = doc.layout === "raw" ? doc.html : blocksHtml(doc, subject, preheader);
  const textTpl = doc.layout === "raw" ? doc.text : blocksText(doc);
  let html = resolveTags(htmlTpl, vars, "html");
  html = rewriteLinks(html, opts);
  html = injectPixel(html, opts);
  const text = resolveTags(textTpl, vars, "text");
  return { subject, html, text };
}

/* ───────────────────────────── helpers for the editor ───────────────────────────── */

export const newBlockId = () => Math.random().toString(36).slice(2, 10);

export function emptyBlock(type: BlockType): Block {
  const id = newBlockId();
  switch (type) {
    case "hero":
      return { id, type, eyebrow: "", title: "A headline" };
    case "text":
      return { id, type, md: "Write something. **Bold**, *italic*, [links](https://www.himanshukukreja.in) and lists work." };
    case "button":
      return { id, type, label: "Open the course →", url: "{{resume_url}}" };
    case "feature":
      return { id, type, tag: "01 · new", title: "Feature title", md: "One or two sentences about it." };
    case "callout":
      return { id, type, eyebrow: "today", title: "A short, punchy line.", label: "Go →", url: "https://www.himanshukukreja.in/learn" };
    case "image":
      return { id, type, src: "", alt: "", href: "" };
    case "divider":
      return { id, type };
    case "html":
      return { id, type, html: "<p style=\"margin:0;\">Custom HTML</p>" };
  }
}
