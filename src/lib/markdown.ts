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
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);

  return String(file);
}
