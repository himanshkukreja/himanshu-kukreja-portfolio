"use client";

import { useState } from "react";
import { X, BookmarkPlus, FileText, TrendingUp, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "./AuthModal";

type AuthPromptBannerProps = {
  variant?: "learn-page" | "lesson-page";
};

export default function AuthPromptBanner({ variant = "learn-page" }: AuthPromptBannerProps) {
  const { user } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Don't show if user is authenticated or banner is dismissed
  if (user || isDismissed) return null;

  const content = {
    "learn-page": {
      icon: <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0" />,
      title: "Unlock Your Full Learning Experience",
      description: "Sign in to track progress, bookmark lessons, and take notes as you learn.",
      features: [
        { icon: <TrendingUp className="w-4 h-4" />, text: "Track your progress" },
        { icon: <BookmarkPlus className="w-4 h-4" />, text: "Bookmark lessons" },
        { icon: <FileText className="w-4 h-4" />, text: "Take notes" },
      ],
    },
    "lesson-page": {
      icon: <BookmarkPlus className="w-5 h-5 text-blue-400 flex-shrink-0" />,
      title: "Want to save your progress?",
      description: "Sign in to bookmark this lesson and track your learning journey.",
      features: [
        { icon: <TrendingUp className="w-4 h-4" />, text: "Auto-save progress" },
        { icon: <BookmarkPlus className="w-4 h-4" />, text: "Quick bookmarks" },
        { icon: <FileText className="w-4 h-4" />, text: "Personal notes" },
      ],
    },
  };

  const { icon, title, description, features } = content[variant];

  return (
    <>
      <div className="relative bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 dark:from-blue-500/10 dark:via-purple-500/10 dark:to-blue-500/10 border border-blue-500/20 dark:border-blue-500/20 rounded-xl p-4 md:p-6 backdrop-blur-sm">
        {/* Dismiss Button */}
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-3 right-3 p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-gray-600 dark:text-white/60" />
        </button>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 pr-8">
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
              {icon}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
            <p className="text-gray-700 dark:text-white/70 text-sm mb-3">{description}</p>

            {/* Features */}
            <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-4 md:mb-0">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-1.5 text-gray-600 dark:text-white/60 text-xs">
                  {feature.icon}
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Button */}
          <div className="flex-shrink-0 w-full md:w-auto">
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full md:w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all font-medium text-sm shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40"
            >
              Sign In Free
            </button>
          </div>
        </div>

        {/* Decorative gradient line */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  );
}
