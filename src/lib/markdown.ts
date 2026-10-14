/**
 * Shared markdown to HTML conversion utility
 * Used by both stories and learning resources
 */

export async function markdownToHtml(md: string): Promise<string> {
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const remarkRehype = (await import("remark-rehype")).default;
  const rehypeStringify = (await import("rehype-stringify")).default;
  const { visit } = await import("unist-util-visit");
  const { resolveCoverUrl } = await import("./utils");

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(() => (tree) => {
      // Transform image URLs to use ImageKit
      visit(tree, 'image', (node: { url?: string }) => {
        if (node.url) {
          const resolvedUrl = resolveCoverUrl(node.url);
          if (resolvedUrl) {
            node.url = resolvedUrl;
          }
        }
      });
    })
    .use(() => (tree) => {
      // ```mermaid → the same figure markup the course renderer emits; <MermaidHydrator/> draws it.
      visit(tree, "code", (node: { type: string; lang?: string | null; value: string; data?: Record<string, unknown> }) => {
        if ((node.lang || "").toLowerCase() !== "mermaid") return;
        const title = node.value.match(/^\s*%%\s*title:\s*(.+)$/m)?.[1]?.trim();
        const btn = (action: string, label: string) => ({
          type: "element", tagName: "button",
          properties: { type: "button", className: ["sd-mermaid-btn"], dataMermaidAction: action },
          children: [{ type: "text", value: label }],
        });
        node.type = "mermaidBlock";
        node.data = {
          hName: "figure",
          hProperties: { className: ["sd-mermaid"], dataSd: "mermaid" },
          hChildren: [
            {
              type: "element", tagName: "div", properties: { className: ["sd-mermaid-head"], dataSdChrome: "" },
              children: [
                { type: "element", tagName: "span", properties: { className: ["sd-mermaid-label"] }, children: [{ type: "text", value: "Diagram" }] },
                ...(title ? [{ type: "element", tagName: "span", properties: { className: ["sd-mermaid-title"] }, children: [{ type: "text", value: title }] }] : []),
                { type: "element", tagName: "span", properties: { className: ["sd-mermaid-tools"] }, children: [btn("zoom", "1:1"), btn("full", "Fullscreen"), btn("copy", "Copy source")] },
              ],
            },
            { type: "element", tagName: "pre", properties: { className: ["sd-mermaid-src"] }, children: [{ type: "text", value: node.value }] },
            { type: "element", tagName: "div", properties: { className: ["sd-mermaid-canvas"], role: "img", ariaLabel: title ? `Diagram: ${title}` : "Diagram", dataSdChrome: "" }, children: [] },
          ],
        };
      });
    })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);

  return String(file);
}
