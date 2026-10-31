/**
 * Profile avatars: the built-in cartoon set (public/avatars/{people,mascots}/<id>.svg), plus helpers
 * shared by the picker, the API route and every place that shows a learner's avatar.
 *
 * user_profiles.avatar_url holds one of:
 *   "/avatars/people/maya.svg"                                   a cartoon from this catalog
 *   "https://<project>.supabase.co/storage/v1/object/public/avatars/<user id>/<random>.webp"  an upload
 *   "https://lh3.googleusercontent.com/…"                        the Google photo (synced at sign-up)
 *   null                                                         initials
 */

export type AvatarGroup = "people" | "mascots";
export type CatalogAvatar = { id: string; label: string };

export const AVATARS: Record<AvatarGroup, CatalogAvatar[]> = {
  people: [
    { id: "sunny", label: "Short dark hair" },
    { id: "maya", label: "Long hair" },
    { id: "kofi", label: "Big afro" },
    { id: "amina", label: "Hijab" },
    { id: "arjun", label: "Turban and beard" },
    { id: "lena", label: "Glasses and a bun" },
    { id: "omar", label: "Beard and side part" },
    { id: "mei", label: "Bob cut" },
    { id: "sam", label: "Bald with glasses and beard" },
    { id: "priya", label: "Ponytail" },
    { id: "rosa", label: "Long curly hair" },
    { id: "zuri", label: "Locs" },
    { id: "kai", label: "Headphones and hoodie" },
    { id: "noor", label: "Buzz cut and earring" },
    { id: "ruth", label: "Grey hair and glasses" },
    { id: "leo", label: "Cap and a grin" },
  ],
  mascots: [
    { id: "robot", label: "Friendly robot" },
    { id: "cat", label: "Cat with headphones" },
    { id: "owl", label: "Owl with glasses" },
    { id: "fox", label: "Fox with a laptop" },
    { id: "database", label: "Database cylinder" },
    { id: "cloud", label: "Happy cloud" },
    { id: "duck", label: "Rubber duck" },
    { id: "octopus", label: "Load-balancer octopus" },
    { id: "server", label: "Server rack" },
    { id: "bug", label: "Debugger ladybug" },
    { id: "queue", label: "Message-queue caterpillar" },
    { id: "coffee", label: "Coffee mug" },
    { id: "rocket", label: "Deploy rocket" },
    { id: "turtle", label: "Slow-query turtle" },
    { id: "bee", label: "Worker bee" },
    { id: "ghost", label: "Background-job ghost" },
  ],
};

export const AVATAR_GROUPS: AvatarGroup[] = ["people", "mascots"];

/** "people/maya" → "/avatars/people/maya.svg" (null when the id isn't in the catalog). */
export function catalogAvatarPath(key: string): string | null {
  const m = /^(people|mascots)\/([a-z0-9-]{1,32})$/.exec(key);
  if (!m) return null;
  const group = m[1] as AvatarGroup;
  return AVATARS[group].some((a) => a.id === m[2]) ? `/avatars/${group}/${m[2]}.svg` : null;
}

/** "/avatars/people/maya.svg" → { group, avatar } when it is one of ours. */
export function parseCatalogAvatar(url: string | null | undefined): { group: AvatarGroup; avatar: CatalogAvatar } | null {
  const m = /^\/avatars\/(people|mascots)\/([a-z0-9-]{1,32})\.svg$/.exec(url || "");
  if (!m) return null;
  const group = m[1] as AvatarGroup;
  const avatar = AVATARS[group].find((a) => a.id === m[2]);
  return avatar ? { group, avatar } : null;
}

export const AVATAR_BUCKET = "avatars";
const UPLOAD_MARK = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

/** The storage path ("<user id>/<file>") of an uploaded avatar URL, or null if it isn't one. */
export function uploadedAvatarPath(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\//.test(url)) return null;
  const i = url.indexOf(UPLOAD_MARK);
  if (i < 0) return null;
  const p = url.slice(i + UPLOAD_MARK.length).split(/[?#]/)[0];
  return /^[0-9a-f-]{36}\/[a-z0-9]{8,40}\.(webp|jpg)$/.test(p) ? p : null;
}

export type AvatarKind = "cartoon" | "upload" | "google" | "none" | "other";

export function avatarKind(url: string | null | undefined, googlePhoto?: string | null): AvatarKind {
  if (!url) return "none";
  if (parseCatalogAvatar(url)) return "cartoon";
  if (uploadedAvatarPath(url)) return "upload";
  if (googlePhoto && url === googlePhoto) return "google";
  if (/^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(url)) return "google";
  return "other";
}

/** Safe to put in an <img src> on a public page: one of our cartoons, or an https image. */
export function isDisplayableAvatar(url: string | null | undefined): url is string {
  return !!url && (!!parseCatalogAvatar(url) || /^https:\/\/[^\s"'<>]+$/.test(url));
}

export function initialsOf(name: string | null | undefined): string {
  return (
    (name || "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Limits the picker shows and the server enforces. */
export const AVATAR_LIMITS = {
  /** The photo a learner picks (before the crop). */
  maxInputBytes: 2 * 1024 * 1024,
  /** Output of the in-browser crop: a square this many pixels wide. */
  size: 256,
  uploadsPerDay: 10,
} as const;
