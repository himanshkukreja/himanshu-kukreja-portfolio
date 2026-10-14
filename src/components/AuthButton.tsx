"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import AuthModal from "./AuthModal";
import UserMenu from "./UserMenu";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthButton() {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return <div className="h-10 w-10 animate-pulse bg-surface-2" aria-hidden />;
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
