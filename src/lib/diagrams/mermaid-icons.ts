type MermaidApi = typeof import("mermaid").default;
type IconLoader = Parameters<MermaidApi["registerIconPacks"]>[0][number];
/** An Iconify JSON icon set, as Mermaid takes it. */
export type IconPack = Extract<IconLoader, { icons: unknown }>["icons"];

/** Icon pack prefixes content may use in `A@{ icon: "<pack>:<name>" }`. */
export const ICON_PACKS = ["tech", "sd"] as const;
type Packs = Record<(typeof ICON_PACKS)[number], IconPack>;

const done = new WeakSet<object>();

/**
 * Registers the diagram icon packs with Mermaid as lazy loaders: Mermaid calls a loader the first
 * time a diagram names an icon from that pack, so the icon chunk is fetched only when needed.
 */
export function registerDiagramIcons(mermaid: MermaidApi, load: () => Promise<Packs>): MermaidApi {
  if (done.has(mermaid)) return mermaid;
  done.add(mermaid);
  mermaid.registerIconPacks(ICON_PACKS.map((name) => ({ name, loader: () => load().then((p) => p[name]) })));
  return mermaid;
}
