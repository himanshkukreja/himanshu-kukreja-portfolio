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

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", key: "overview", match: (p: string) => p === "/admin" },
  { href: "/admin/live", label: "Live", key: "live", match: (p: string) => p.startsWith("/admin/live") },
  { href: "/admin/learners", label: "Learners", key: "learners", match: (p: string) => p.startsWith("/admin/learners") },
  { href: "/admin/course", label: "Course", key: "course", match: (p: string) => p.startsWith("/admin/course") },
  { href: "/admin/traffic", label: "Traffic", key: "traffic", match: (p: string) => p.startsWith("/admin/traffic") },
  { href: "/admin/journeys", label: "Journeys", key: "journeys", match: (p: string) => p.startsWith("/admin/journeys") },
  { href: "/admin/content", label: "Content", key: "content", match: (p: string) => p.startsWith("/admin/content") },
  { href: "/admin/case-files", label: "Case files", key: "case-files", match: (p: string) => p.startsWith("/admin/case-files") },
  { href: "/admin/newsletter", label: "Newsletter", key: "newsletter", match: (p: string) => p.startsWith("/admin/newsletter") },
] as const;

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

  return (
    <div data-ph-mask className="mx-auto w-full max-w-[1320px] px-4 pb-12 sm:px-6">
      {/* phones + tablets: sticky tab strip under the site header */}
      <nav
        aria-label="Admin sections"
        className="sticky top-[var(--hk-header-h,57px)] z-40 -mx-4 flex overflow-x-auto border-b border-line bg-bg/95 px-1 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:px-4 lg:hidden"
      >
        {ADMIN_NAV.map((n) => {
          const on = n.match(pathname);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`-mb-px flex min-h-12 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1.5 font-mono text-[13px] sm:flex-none sm:px-3 ${on ? "border-signal text-fg" : "border-transparent text-fg-3"}`}
            >
              {n.label.toLowerCase()}
              {n.key === "live" && live != null && live > 0 && <span className="bg-signal px-1 text-[10px] font-semibold leading-4 text-on-signal">{live}</span>}
            </Link>
          );
        })}
      </nav>
      {preview && <PreviewBanner />}

      <div className="pt-5 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8 lg:pt-8 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-10">
        <aside className="sticky top-[calc(var(--hk-header-h,57px)+32px)] hidden max-h-[calc(100dvh-var(--hk-header-h,57px)-48px)] flex-col self-start lg:flex">
          <div className="border border-line bg-surface">
            <div className="border-b border-line px-3.5 py-3">
              <div className="font-mono text-[13px] font-semibold text-fg">
                <span className="text-signal-text">#</span> sudo ~/admin
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-fg-3" title={email}>
                {email}
              </div>
            </div>
            <nav aria-label="Admin sections" className="flex flex-col py-1.5">
              {ADMIN_NAV.map((n, i) => {
                const on = n.match(pathname);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    className={`relative flex min-h-10 items-center gap-3 px-3.5 text-sm ${on ? "bg-surface-2 font-semibold text-fg" : "text-fg-2 hover:bg-surface-2/60 hover:text-fg"}`}
                  >
                    {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] bg-signal" />}
                    <span className={`font-mono text-[11px] ${on ? "text-signal-text" : "text-fg-4"}`}>0{i + 1}</span>
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
            </nav>
          </div>
          <ShellFooter className="mt-3" />
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
