"use client";

import { useState } from "react";
import { UserCircle } from "lucide-react";
import AuthModal from "./AuthModal";
import UserMenu from "./UserMenu";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthButton() {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 animate-pulse" />
    );
  }

  if (user) {
    return <UserMenu />;
  }

  return (
    <>
      <button
        onClick={() => setShowAuthModal(true)}
        className="p-2 rounded-full border border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-all"
        aria-label="Sign in"
        title="Sign in"
      >
        <UserCircle className="w-5 h-5" />
      </button>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  );
}
