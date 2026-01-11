"use client";

import AuthModal from "./AuthModal";
import { useAuthModal } from "@/contexts/AuthModalContext";

export default function GlobalAuthModal() {
  const { isOpen, closeAuthModal } = useAuthModal();

  return <AuthModal isOpen={isOpen} onClose={closeAuthModal} />;
}
