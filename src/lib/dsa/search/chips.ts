/**
 * The "Understood as" chips of the smart search: the model may return the same word in two cases ("BFS", "bfs"), which
 * would show as two chips. Case-insensitive on the label; the first form is kept. Pure, so node --test runs it.
 */
export function dedupeChips<T extends { label: string }>(chips: T[]): T[] {
  const seen = new Set<string>();
  return chips.filter((c) => {
    const k = c.label.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
