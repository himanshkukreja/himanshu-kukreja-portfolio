"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const LINKS = [
  { href: "/learn", label: "course" },
  { href: "/learn/dashboard", label: "profile" },
  { href: "/learn/bookmarks", label: "bookmarks" },
  { href: "/learn/notes", label: "notes" },
];

export default function UserMenu() {
  const { user, profile, loading, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  if (!user) return null;

  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url;
  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Account menu"
        className="grid h-10 w-10 place-items-center overflow-hidden bg-fg font-display text-sm font-extrabold text-bg"
      >
        {loading && !profile ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : avatarUrl ? (
          <Image src={avatarUrl} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized={avatarUrl.includes("googleusercontent.com")} />
        ) : (
          initials
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-64 animate-hk-in border border-line-strong bg-surface">
          <div className="border-b border-line px-4 py-3">
            <p className="font-medium text-fg">{displayName}</p>
            <p className="truncate text-sm text-fg-3">{user.email}</p>
            {profile && profile.current_streak > 0 && (
              <span className="mt-2 inline-block border border-signal px-2 py-1 font-mono text-xs text-signal-text">{profile.current_streak}-day streak</span>
            )}
          </div>
          <nav aria-label="Account" className="flex flex-col py-1.5 font-mono text-sm">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-fg-2 hover:bg-surface-2 hover:text-fg">
                <span className="text-signal-text">❯</span> {l.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-line">
            <button
              type="button"
              onClick={async () => {
                if (isSigningOut) return;
                setIsSigningOut(true);
                await signOut();
              }}
              disabled={isSigningOut}
              className="flex w-full items-center gap-3 px-4 py-2.5 font-mono text-sm text-bad-text hover:bg-surface-2 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {isSigningOut ? "signing out…" : "sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
