"use client";

/**
 * /admin client gate + chrome. Signed-out or non-admin → "403 · sudo required". Admins (verified
 * server-side via GET /api/admin/me with the Bearer session) get the left rail (desktop) / sticky
 * tab strip (phones) and the AdminClient context that useAdminData() reads.
 *
 * Dev-only preview: `?preview=1` when NODE_ENV === "development" renders the shell with fixture
 * data and no auth. `DEV` is a build-time constant, so production bundles drop the whole branch
 * (and never load ./fixtures).
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { adminJson } from "@/lib/admin/fetch";
import { AdminClientContext, adminText, ErrorState, LiveDot, Skeleton, useAdminClient, useAdminData, type AdminClient, type AdminError } from "../ui";
import type { TrafficLive } from "./types";
import Forbidden from "./Forbidden";

const DEV = process.env.NODE_ENV === "development";
const PREVIEW_KEY = "hk.adminPreview";
const NOTRACK_KEY = "hk.notrack";

type NavItem = { href: string; label: string; key: string; match: (p: string) => boolean };
const at = (href: string, label: string, key: string): NavItem => ({ href, label, key, match: (p: string) => p.startsWith(href) });

/** The admin sections, grouped so related pages sit together (the rail scrolls when they don't fit). */
export const ADMIN_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pulse",
    items: [
      { href: "/admin", label: "Overview", key: "overview", match: (p: string) => p === "/admin" },
      at("/admin/live", "Live", "live"),
      at("/admin/traffic", "Traffic", "traffic"),
      at("/admin/journeys", "Journeys", "journeys"),
    ],
  },
  { label: "Learners", items: [at("/admin/learners", "Learners", "learners"), at("/admin/certificates", "Certificates", "certificates"), at("/admin/newsletter", "Newsletter", "newsletter")] },
  {
    label: "Course & content",
    items: [at("/admin/course", "Course", "course"), at("/admin/content", "Content", "content"), at("/admin/gaps", "Gaps", "gaps"), at("/admin/case-files", "Case files", "case-files"), at("/admin/design-week", "Design week", "design-week")],
  },
  { label: "Video", items: [at("/admin/lectures", "Lectures", "lectures"), at("/admin/shorts", "Shorts", "shorts"), at("/admin/publishing", "Publishing", "publishing"), at("/admin/distribution", "Distribution", "distribution")] },
  { label: "AI", items: [at("/admin/ai", "AI", "ai"), at("/admin/chat", "Chat", "chat")] },
];
export const ADMIN_NAV: NavItem[] = ADMIN_GROUPS.flatMap((g) => g.items);

/* ─────────────── tiny storage stores (useSyncExternalStore) ─────────────── */

const STORE_EVENT = "hk-admin-store";
const subscribeStore = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(STORE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STORE_EVENT, cb);
  };
};
const readStore = (kind: "local" | "session", key: string) => {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const writeStore = (kind: "local" | "session", key: string, value: string | null) => {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    if (value == null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage blocked: nothing to persist */
  }
  window.dispatchEvent(new Event(STORE_EVENT));
};

/** Dev-only preview flag: `?preview=1` turns it on for this tab, `?preview=0` off. */
function usePreviewFlag() {
  const q = useSearchParams().get("preview");
  const stored = useSyncExternalStore(
    subscribeStore,
    () => (DEV ? readStore("session", PREVIEW_KEY) : null),
    () => null
  );
  useEffect(() => {
    if (!DEV) return;
    if (q === "1") writeStore("session", PREVIEW_KEY, "1");
    else if (q === "0") writeStore("session", PREVIEW_KEY, null);
  }, [q]);
  if (!DEV) return false;
  return q === "1" || (q !== "0" && stored === "1");
}

/* ─────────────────────────────── shell ─────────────────────────────── */

export default function AdminShell({ children }: { children: ReactNode }) {
  const preview = usePreviewFlag();
  // Case files preview frame (iframe inside the editor): renders only what the parent editor posts
  // to it, so it needs no gate and no chrome.
  const bare = (usePathname() || "").startsWith("/admin/case-files/frame");
  if (bare) return <>{children}</>;
  if (DEV && preview) return <PreviewRuntime>{children}</PreviewRuntime>;
  return <GatedRuntime>{children}</GatedRuntime>;
}

type Check = { userId: string; status: "ok" | "denied" | "error"; email?: string };

function GatedRuntime({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [check, setCheck] = useState<Check | null>(null);
  const [nonce, setNonce] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let off = false;
    adminJson<{ email: string }>("/api/admin/me")
      .then((r) => {
        if (!off) setCheck({ userId, status: "ok", email: r.email });
      })
      .catch((e: AdminError) => {
        if (!off) setCheck({ userId, status: e?.status === 401 || e?.status === 403 ? "denied" : "error" });
      });
    return () => {
      off = true;
    };
  }, [userId, nonce]);

  const onUnauthorized = useCallback(() => {
    if (userId) setCheck({ userId, status: "denied" });
  }, [userId]);
  const client = useMemo<AdminClient>(() => ({ json: adminJson, text: adminText, preview: false, onUnauthorized }), [onUnauthorized]);

  const current = check && check.userId === userId ? check : null;
  // Once this user is confirmed as admin, keep the screen mounted through auth refreshes: swapping
  // in the "checking" state would unmount open editors (and lose their in-memory state).
  if (!(current?.status === "ok") && (loading || (userId && !current))) return <Forbidden mode="checking" />;
  if (!userId) return <Forbidden mode="signedOut" onSignIn={openAuthModal} />;
  if (current!.status !== "ok")
    return (
      <Forbidden
        mode={current!.status === "denied" ? "notAdmin" : "error"}
        email={user?.email}
        onSignOut={() => {
          void signOut().then(openAuthModal);
        }}
        onRetry={() => setNonce((n) => n + 1)}
      />
    );

  return (
    <AdminClientContext.Provider value={client}>
      <Frame email={current!.email || user?.email || ""}>{children}</Frame>
    </AdminClientContext.Provider>
  );
}

function PreviewRuntime({ children }: { children: ReactNode }) {
  const [mod, setMod] = useState<typeof import("./fixtures") | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    // `if (DEV) { import() }` (not an early return) so webpack's constant folding removes the
    // import — and with it the fixtures chunk — from production builds.
    if (DEV) {
      import("./fixtures")
        .then((m) => {
          if (!off) setMod(m);
        })
        .catch((e: Error) => {
          if (!off) setFailed(e.message || "fixtures failed to load");
        });
    }
    return () => {
      off = true;
    };
  }, []);
  const client = useMemo<AdminClient | null>(() => {
    if (!DEV || !mod) return null;
    return {
      preview: true,
      onUnauthorized: () => {},
      json: async <T,>(url: string, init?: RequestInit) => {
        const v = mod.resolveFixture(url, init);
        await new Promise((r) => setTimeout(r, 120));
        // No fixture: try the real API (works if you're also signed in as admin).
        if (v === undefined) return adminJson<T>(url, init);
        return v as T;
      },
      text: async (url: string, init?: RequestInit) => {
        const v = mod.resolveFixtureText(url);
        await new Promise((r) => setTimeout(r, 120));
        return v ?? adminText(url, init);
      },
    };
  }, [mod]);
  if (!client)
    return (
      <div className="mx-auto max-w-[1320px] px-4 py-10 sm:px-6">
        {failed ? <ErrorState error={failed} title="Preview fixtures failed to load" onRetry={() => window.location.reload()} /> : <Skeleton className="h-40 w-full" />}
      </div>
    );
  return (
    <AdminClientContext.Provider value={client}>
      <Frame email="preview@localhost">{children}</Frame>
    </AdminClientContext.Provider>
  );
}

/* ─────────────────────────────── chrome ─────────────────────────────── */

function useLive() {
  const { data, error } = useAdminData<TrafficLive>("/api/admin/traffic/live", { refreshMs: 30_000 });
  return error ? null : (data?.live ?? null);
}

function Frame({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname() || "/admin";
  const { preview } = useAdminClient();
  const live = useLive();
  // phones: the group whose pages the strip shows (the current page's group until another is picked)
  const activeGroup = Math.max(0, ADMIN_GROUPS.findIndex((g) => g.items.some((n) => n.match(pathname))));
  const [picked, setPicked] = useState<{ path: string; group: number } | null>(null);
  const shownGroup = picked && picked.path === pathname ? picked.group : activeGroup;
  const setOpenGroup = (group: number) => setPicked({ path: pathname, group });

  return (
    <div data-ph-mask className="mx-auto w-full max-w-[1320px] px-4 pb-12 sm:px-6">
      {/* phones + tablets: sticky strip under the site header: the groups, then the chosen group's pages */}
      <nav aria-label="Admin sections" className="sticky top-[var(--hk-header-h,57px)] z-40 -mx-4 border-b border-line bg-bg/95 backdrop-blur sm:-mx-6 lg:hidden">
        <div role="tablist" aria-label="Admin groups" className="flex overflow-x-auto px-2 pt-1.5 [scrollbar-width:none] sm:px-4">
          {ADMIN_GROUPS.map((g, gi) => {
            const on = gi === shownGroup;
            return (
              <button
                key={g.label}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setOpenGroup(gi)}
                className={`flex min-h-9 shrink-0 items-center whitespace-nowrap px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] ${on ? "bg-surface-2 text-fg" : "text-fg-4 hover:text-fg-2"}`}
              >
                {g.label}
                {g.items.some((n) => n.key === "live") && live != null && live > 0 && <span className="ml-1.5 bg-signal px-1 text-[10px] font-semibold leading-4 text-on-signal">{live}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex overflow-x-auto px-1 [scrollbar-width:none] sm:px-4">
          {ADMIN_GROUPS[shownGroup].items.map((n) => {
            const on = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-3 font-mono text-[13px] ${on ? "border-signal text-fg" : "border-transparent text-fg-3"}`}
              >
                {n.label.toLowerCase()}
                {n.key === "live" && live != null && live > 0 && <span className="bg-signal px-1 text-[10px] font-semibold leading-4 text-on-signal">{live}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
      {preview && <PreviewBanner />}

      <div className="pt-5 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8 lg:pt-8 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-10">
        <aside className="sticky top-[calc(var(--hk-header-h,57px)+32px)] hidden max-h-[calc(100dvh-var(--hk-header-h,57px)-48px)] min-h-0 flex-col self-start lg:flex">
          <div className="flex min-h-0 flex-col border border-line bg-surface">
            <div className="shrink-0 border-b border-line px-3.5 py-3">
              <div className="font-mono text-[13px] font-semibold text-fg">
                <span className="text-signal-text">#</span> sudo ~/admin
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-fg-3" title={email}>
                {email}
              </div>
            </div>
            {/* the list scrolls inside the rail when the window is too short for all of it */}
            <nav aria-label="Admin sections" className="flex min-h-0 flex-col overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]">
              {ADMIN_GROUPS.map((g) => (
                <div key={g.label} role="group" aria-labelledby={`admin-group-${g.label}`} className="flex flex-col pb-1 [&+&]:border-t [&+&]:border-line [&+&]:pt-1">
                  <div id={`admin-group-${g.label}`} className="px-3.5 pb-0.5 pt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-4">
                    {g.label}
                  </div>
                  {g.items.map((n) => {
                    const on = n.match(pathname);
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        aria-current={on ? "page" : undefined}
                        className={`relative flex min-h-9 shrink-0 items-center gap-3 px-3.5 text-sm ${on ? "bg-surface-2 font-semibold text-fg" : "text-fg-2 hover:bg-surface-2/60 hover:text-fg"}`}
                      >
                        {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] bg-signal" />}
                        <span className="flex-1">{n.label}</span>
                        {n.key === "live" && live != null && (
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-3" title={`${live} live visitor${live === 1 ? "" : "s"} (last 5 min)`}>
                            <LiveDot on={live > 0} />
                            {live}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
          <ShellFooter className="mt-3 shrink-0" />
        </aside>

        <main className="min-w-0">{children}</main>
      </div>

      <ShellFooter className="mt-10 lg:hidden" />
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-dashed border-signal bg-signal/10 px-3 py-2 font-mono text-xs text-fg">
      <span>
        <span className="font-semibold text-signal-text">PREVIEW</span> · dev-only mock data, writes are simulated
      </span>
      <Link href="?preview=0" className="min-h-9 content-center px-1 text-fg-3 underline underline-offset-4 hover:text-fg">
        exit preview
      </Link>
    </div>
  );
}

/** "Exclude my visits" (localStorage hk.notrack=1, honoured by the tracker) + way back to the site. */
function ShellFooter({ className = "" }: { className?: string }) {
  const notrack = useSyncExternalStore(subscribeStore, () => readStore("local", NOTRACK_KEY) === "1", () => false);
  return (
    <div className={`border border-line bg-surface px-3.5 py-3 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={notrack}
        onClick={() => writeStore("local", NOTRACK_KEY, notrack ? null : "1")}
        className="flex min-h-10 w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm text-fg">Exclude my visits</span>
          <span className="block font-mono text-[11px] text-fg-3">{notrack ? "this browser isn't tracked" : "this browser is tracked"}</span>
        </span>
        <span aria-hidden className={`relative h-5 w-9 shrink-0 border ${notrack ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}>
          <span className={`absolute top-0.5 h-3.5 w-3.5 transition-[left] ${notrack ? "left-[18px] bg-on-signal" : "left-0.5 bg-fg-3"}`} />
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-mono text-[11px] text-fg-3">
        <Link href="/" className="min-h-9 content-center hover:text-fg">
          ← exit to site
        </Link>
        <span className="text-fg-4">noindex</span>
      </div>
    </div>
  );
}
