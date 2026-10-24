import palette from "./palette.json";

export type DiagramTheme = "dark" | "light";

type Style = Record<string, string>;
const CLASSES = palette.classes as Record<string, Record<DiagramTheme, Style>>;

/** Diagram kinds that accept `classDef` (sequence diagrams style through themeVariables only). */
const CLASSDEF_KINDS = /^(flowchart|graph|stateDiagram(-v2)?|classDiagram)\b/;

/** `note` is a keyword in class diagrams (`note for X "…"`), so a classDef by that name breaks them. */
function classDefs(theme: DiagramTheme, classDiagram = false): string[] {
  return Object.entries(CLASSES)
    .filter(([name]) => !(classDiagram && name === "note"))
    .map(([name, t]) => {
      const s = t[theme];
      const parts = Object.entries(s).map(([k, v]) => `${k}:${v}`);
      return `  classDef ${name} ${parts.join(",")}`;
    });
}

/**
 * Inject the semantic classDefs (core, edge, store, cache, queue, client, service, external,
 * hot, ok, bad, note) right after the diagram header, so content only names classes and the
 * site decides the colours for the active theme.
 */
export function prepareMermaidSource(src: string, theme: DiagramTheme): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  // skip leading blank lines, front matter and %% comments / %%{init}%% directives
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = lines.findIndex((l, k) => k > 0 && l.trim() === "---") + 1;
  }
  while (
    i < lines.length &&
    (!lines[i].trim() || lines[i].trim().startsWith("%%"))
  )
    i++;
  const header = (lines[i] || "").trim();
  if (!CLASSDEF_KINDS.test(header)) return src;
  const body = /^(flowchart|graph)\b/.test(header)
    ? lines.slice(i + 1).map(squareIcons)
    : lines.slice(i + 1);
  return [
    ...lines.slice(0, i + 1),
    ...classDefs(theme, /^classDiagram\b/.test(header)),
    ...body,
  ].join("\n");
}

/** `A@{ … }` shape data; quoted values may contain braces. */
const SHAPE_DATA = /@\{((?:[^}"]|"[^"]*")*)\}/g;

/**
 * Icon nodes (`A@{ icon: "tech:kafka", label: "Kafka" }`) are drawn as a square tile filled with the
 * node's semantic class colour (the icon itself takes the class stroke colour), unless the content
 * picked another `form:`. Content names the icon; the site decides how it looks.
 */
function squareIcons(line: string): string {
  if (!line.includes("@{")) return line;
  return line.replace(SHAPE_DATA, (m, inner: string) => {
    if (!/\bicon\s*:/.test(inner) || /\bform\s*:/.test(inner)) return m;
    return `@{ ${inner.trim().replace(/,\s*$/, "")}, form: "square" }`;
  });
}

export function mermaidConfig(theme: DiagramTheme) {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: "base" as const,
    themeVariables: (palette.theme as Record<DiagramTheme, Style>)[theme],
    flowchart: {
      curve: "basis" as const,
      padding: 14,
      htmlLabels: true,
      useMaxWidth: true,
    },
    sequence: {
      useMaxWidth: true,
      mirrorActors: false,
      showSequenceNumbers: false,
      actorMargin: 60,
    },
    state: { useMaxWidth: true },
  };
}
