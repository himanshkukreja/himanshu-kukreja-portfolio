"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import UserAvatar from "./UserAvatar";
import AvatarPicker from "./AvatarPickerLazy";

/** The signed-in learner's avatar with a "change" affordance; opens the avatar picker. */
export default function ProfileAvatarButton({ size = 72, className = "" }: { size?: number; className?: string }) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "You";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Change avatar" title="Change avatar" className={`group relative shrink-0 ${className}`} style={{ width: size, height: size }}>
        <UserAvatar src={profile ? profile.avatar_url : null} name={name} size={size} className="border border-line-strong" initialsClassName="bg-fg text-bg" />
        <span aria-hidden className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center border border-line-strong bg-surface text-fg-2 transition-colors group-hover:bg-signal group-hover:text-on-signal">
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </button>
      <AvatarPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}
