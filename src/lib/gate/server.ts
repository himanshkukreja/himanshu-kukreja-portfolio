import { GATE_ON } from "./flag";
import { gateHtml, type GateResult } from "./split";

/** An article's rendered HTML with its gated part marked (src/lib/gate/split.ts), or as it was while the gate is off. */
export function gateArticle(html: string): GateResult {
  return GATE_ON ? gateHtml(html) : { html, gated: false, open: 1 };
}
