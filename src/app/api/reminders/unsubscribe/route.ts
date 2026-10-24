import { NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/reminders/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#000;color:#f3f2ee;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px">
<main style="max-width:480px;border:1px solid #3a3a40;padding:28px"><h1 style="margin:0 0 10px;font-size:24px">${title}</h1><p style="margin:0 0 18px;color:#c9c8c4;line-height:1.55">${body}</p>
<a href="/learn/dashboard" style="color:#ff6b2b">Reminder settings on your Progress page →</a></main></body></html>`;

/** One-click email unsubscribe from a reminder email's footer link (?t=<token>). */
export async function GET(req: NextRequest) {
  const ok = await unsubscribeByToken(req.nextUrl.searchParams.get("t") || "");
  const html = ok
    ? page("Reminder emails are off", "You won't get streak reminder emails any more. You can switch them back on any time.")
    : page("That link didn't work", "It may be old. You can turn reminder emails off on your Progress page.");
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
// mail clients that support one-click unsubscribe POST to the same URL
export const POST = GET;
