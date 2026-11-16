/**
 * The editorial's HTML holds the four-language solutions as one `<figure data-tabs-id="solutions">` block inside the
 * write-up. The problem page shows them on their own tab, so this lifts that block out (balanced `<figure>` count: the
 * code samples inside are figures too). No solutions block: everything stays in the editorial and `solutions` is "".
 */
export function splitEditorial(html: string): { editorial: string; solutions: string } {
  const open = html.search(/<figure\b[^>]*\bdata-tabs-id="solutions"/);
  if (open < 0) return { editorial: html, solutions: "" };
  const re = /<figure\b|<\/figure>/g;
  re.lastIndex = open;
  let depth = 0;
  let end = -1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === "</figure>" ? -1 : 1;
    if (depth === 0) {
      end = m.index + m[0].length;
      break;
    }
  }
  if (end < 0) return { editorial: html, solutions: "" };
  return { editorial: html.slice(0, open) + html.slice(end), solutions: html.slice(open, end) };
}
