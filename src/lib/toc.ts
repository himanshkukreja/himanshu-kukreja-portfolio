/**
 * Table of Contents utilities
 * Extract headings from HTML content for navigation
 */

export type TocHeading = {
  id: string;
  text: string;
  level: number; // 1-6 for h1-h6
};

/**
 * Extract headings from HTML string
 * Generates IDs for headings that don't have them
 */
export function extractHeadings(html: string): TocHeading[] {
  const headings: TocHeading[] = [];

  // Match h1-h3 tags (we'll only show these in TOC for cleaner navigation)
  const headingRegex = /<h([1-3])(?:\s+id=["']([^"']+)["'])?[^>]*>(.*?)<\/h\1>/gi;

  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const existingId = match[2];
    const text = match[3]
      .replace(/<[^>]*>/g, '') // Remove any HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    // Generate ID from text if not present
    const id = existingId || slugify(text);

    headings.push({
      id,
      text,
      level,
    });
  }

  return headings;
}

/**
 * Add IDs to headings in HTML if they don't have them
 */
export function addHeadingIds(html: string): string {
  const usedIds = new Set<string>();

  return html.replace(/<h([1-6])(?:\s+id=["']([^"']+)["'])?([^>]*)>(.*?)<\/h\1>/gi, (match, level, existingId, attrs, content) => {
    if (existingId) {
      usedIds.add(existingId);
      return match; // Already has an ID, keep as-is
    }

    // Extract text content for ID generation
    const text = content
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    let id = slugify(text);

    // Ensure unique ID
    let counter = 1;
    let uniqueId = id;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${id}-${counter}`;
      counter++;
    }
    usedIds.add(uniqueId);

    return `<h${level} id="${uniqueId}"${attrs}>${content}</h${level}>`;
  });
}

/**
 * Convert text to URL-friendly slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Trim hyphens from start/end
}
