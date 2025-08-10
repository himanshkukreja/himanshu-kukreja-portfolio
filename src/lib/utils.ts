export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function resolveCoverUrl(src?: string): string | undefined {
  if (!src) return undefined;
  const s = src.trim();
  if (!s) return undefined;
  // already absolute
  if (/^https?:\/\//i.test(s)) return s;

  const base = process.env.NEXT_PUBLIC_IMAGEKIT_BASE_URL?.replace(/\/$/, "");
  const prefix = process.env.NEXT_PUBLIC_IMAGEKIT_PREFIX_PATH?.replace(/^\/+|\/+$/g, ""); // no leading/trailing slashes
  if (base) {
    // If we have a local-like path, optionally rewrite '/blueprints/foo.png' => '<base>/<prefix>/foo.png'
    if (s.startsWith("/")) {
      const file = s.split("/").pop() || "";
      const path = prefix ? `${prefix}/${file}` : s.replace(/^\//, "");
      return `${base}/${path}`;
    }
    return `${base}/${s.replace(/^\//, "")}`;
  }

  // Fallback to site absolute URL for local assets
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (s.startsWith("/")) return site ? `${site}${s}` : s;
  return s;
}
