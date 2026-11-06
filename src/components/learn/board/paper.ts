/**
 * The whiteboard's paper (Excalidraw's viewBackgroundColor) for the course theme in force: the theme's surface
 * on the tinted light themes (Paper, Sepia, Mint), where a white board glared off the page; white everywhere
 * else (Light, the portfolio, and the dark themes, whose white Excalidraw inverts into its own dark board).
 * Only the view: the saved scene keeps no background.
 */
export function boardPaper(): string {
  if (typeof document === "undefined") return "#ffffff";
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "#ffffff";
  const mode = root.dataset.readMode;
  if (mode !== "paper" && mode !== "sepia" && mode !== "mint") return "#ffffff";
  return getComputedStyle(root).getPropertyValue("--c-surface").trim() || "#ffffff";
}
