"use client";

import { useEffect, useState } from "react";

/**
 * Reading Progress Bar Component
 * Shows a sticky progress indicator at the top of the page
 * that fills as the user scrolls through the content
 */
export default function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      // Get total scrollable height
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;

      // Calculate progress percentage
      const totalScroll = documentHeight - windowHeight;
      const currentProgress = (scrollTop / totalScroll) * 100;

      setProgress(Math.min(currentProgress, 100));
    };

    // Update on scroll
    window.addEventListener("scroll", updateProgress, { passive: true });

    // Initial calculation
    updateProgress();

    return () => window.removeEventListener("scroll", updateProgress);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Percentage indicator */}
      <div className="absolute top-2 right-4 bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
        <span className="text-xs font-medium text-white">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}
