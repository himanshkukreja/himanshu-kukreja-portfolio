"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import AuthModal from "./AuthModal";
import UserMenu from "./UserMenu";
import { Spinner } from "@/components/ui/loader";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthButton() {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return (
      <span role="status" aria-label="Checking sign-in" title="Checking sign-in" className="grid h-10 w-10 place-items-center border border-line text-[13px] text-fg-4">
        <Spinner />
      </span>
    );
  }

  if (user) {
    return <UserMenu />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAuthModal(true)}
        className="grid h-10 w-10 place-items-center border border-line-strong text-fg hover:bg-surface-2"
        aria-label="Sign in"
        title="Sign in"
      >
        <LogIn className="h-4 w-4" aria-hidden />
      </button>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
}
