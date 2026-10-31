"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ImagePlus, LogOut } from "lucide-react";
import { Spinner } from "@/components/ui/loader";
import { useAuth } from "@/contexts/AuthContext";
import UserAvatar from "@/components/avatar/UserAvatar";
import AvatarPicker from "@/components/avatar/AvatarPickerLazy";

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  // The profile is the source of truth once loaded (null = the learner chose initials); the Google
  // photo in the session metadata only stands in if the profile couldn't be fetched.
  const avatarUrl = profile ? profile.avatar_url : loading ? null : user.user_metadata?.avatar_url;
  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const openPicker = () => {
    setIsOpen(false);
    setPickerOpen(true);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Account menu"
        className="grid h-10 w-10 place-items-center overflow-hidden bg-fg font-display text-sm font-extrabold text-bg"
      >
        {loading && !profile ? <Spinner className="text-[13px]" /> : <UserAvatar src={avatarUrl} name={displayName} size={40} initialsClassName="bg-fg text-bg" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-64 animate-hk-in border border-line-strong bg-surface">
          <div className="flex items-start gap-3 border-b border-line px-4 py-3">
            <button type="button" onClick={openPicker} aria-label="Change avatar" title="Change avatar" className="group relative mt-0.5 shrink-0">
              <UserAvatar src={avatarUrl} name={displayName} size={44} className="border border-line-strong" initialsClassName="bg-fg text-bg" />
              <span aria-hidden className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center border border-line-strong bg-surface text-fg-2 group-hover:bg-signal group-hover:text-on-signal">
                <ImagePlus className="h-3 w-3" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{displayName}</p>
              <p className="truncate text-sm text-fg-3">{user.email}</p>
              {profile && profile.current_streak > 0 && (
                <span className="mt-2 inline-block border border-signal px-2 py-1 font-mono text-xs text-signal-text">{profile.current_streak}-day streak</span>
              )}
            </div>
          </div>
          <nav aria-label="Account" className="flex flex-col py-1.5 font-mono text-sm">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-fg-2 hover:bg-surface-2 hover:text-fg">
                <span className="text-signal-text">❯</span> {l.label}
              </Link>
            ))}
            <button type="button" onClick={openPicker} className="px-4 py-2.5 text-left text-fg-2 hover:bg-surface-2 hover:text-fg">
              <span className="text-signal-text">❯</span> change avatar
            </button>
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
              {isSigningOut ? <Spinner className="w-4" /> : <LogOut className="h-4 w-4" aria-hidden />}
              {isSigningOut ? "signing out…" : "sign out"}
            </button>
          </div>
        </div>
      )}
      <AvatarPicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          buttonRef.current?.focus();
        }}
      />
    </div>
  );
}
