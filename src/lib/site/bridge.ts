/**
 * The bridge page the old host serves (instead of the 301) to a person's first browser visit of a
 * course URL: carries their localStorage to the course host once (src/lib/site/carry.ts), then
 * location.replace()s to the exact new URL. Without JavaScript it is a meta refresh + a link.
 */
import { CARRY_JS } from "./carry";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function bridgeHtml(target: string): string {
  const t = esc(target);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>System Design Mastery has moved</title>
<link rel="canonical" href="${t}"><noscript><meta http-equiv="refresh" content="0;url=${t}"></noscript>
<style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#F5F4F0;color:#141414}@media (prefers-color-scheme:dark){body{background:#000;color:#f3f2ee}}a{color:inherit}p{margin:0;padding:24px;max-width:36rem;text-align:center}</style>
</head><body><p>System Design Mastery now lives at <a href="${t}">systemdesignmastery.dev</a>. Taking you there…</p>
<script>${CARRY_JS}
window.__hkCarry(${JSON.stringify(target).replace(/</g, "\\u003c")});</script></body></html>`;
}
