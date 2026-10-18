import names from "./icons/names.json";

const KNOWN: Record<string, Set<string>> = { tech: new Set(names.tech), sd: new Set(names.sd) };

/** `icon: "pack:name"` inside a node's `@{ … }` shape data. */
const ICON_REF = /@\{(?:[^}"]|"[^"]*")*?\bicon\s*:\s*"([^"]*)"/g;

/** Icon names a Mermaid diagram uses that the site's packs don't have (Mermaid would draw a "?"). */
export function unknownDiagramIcons(src: string): string[] {
  const bad = new Set<string>();
  for (const m of src.matchAll(ICON_REF)) {
    const [pack, name] = m[1].split(":");
    if (!name || !KNOWN[pack]?.has(name)) bad.add(m[1]);
  }
  return [...bad];
}
