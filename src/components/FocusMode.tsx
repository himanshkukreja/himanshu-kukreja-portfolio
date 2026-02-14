"use client";

import { useState, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type Props = {
  children: React.ReactNode;
  sidebarLeft?: React.ReactNode;
  sidebarRight?: React.ReactNode;
};

export default function FocusMode({ children, sidebarLeft, sidebarRight }: Props) {
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    // Handle keyboard shortcut (F key)
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Check if user is not typing in an input/textarea/contentEditable
        const target = e.target as HTMLElement;
        const isEditable = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.isContentEditable;
        if (!isEditable) {
          e.preventDefault();
          setIsFocusMode(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <>
      {/* Focus Mode Toggle Button - Hidden on mobile */}
      <button
        onClick={() => setIsFocusMode(!isFocusMode)}
        className="hidden lg:block fixed bottom-6 right-6 z-50 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-all group"
        aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}
        title={isFocusMode ? "Exit focus mode (F)" : "Enter focus mode (F)"}
      >
        {isFocusMode ? (
          <Minimize2 className="w-5 h-5" />
        ) : (
          <Maximize2 className="w-5 h-5" />
        )}
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {isFocusMode ? "Exit" : "Focus mode"} (F)
        </span>
      </button>

      {/* Layout Grid */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 transition-all duration-300`}>
        {/* Left Sidebar - shows at top on mobile */}
        <aside
          className={`lg:col-span-2 order-1 transition-all duration-300 ${
            isFocusMode ? 'hidden lg:block lg:opacity-20 lg:blur-sm lg:pointer-events-none' : 'opacity-100'
          }`}
        >
          {sidebarLeft}
        </aside>

        {/* Main Content */}
        <article
          className={`order-2 transition-all duration-300 ${
            isFocusMode ? 'lg:col-span-12 mx-auto max-w-4xl' : 'lg:col-span-7'
          }`}
        >
          {children}
        </article>

        {/* Right Sidebar */}
        <aside
          className={`hidden lg:block lg:col-span-3 order-3 transition-all duration-300 ${
            isFocusMode ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'
          }`}
        >
          {sidebarRight}
        </aside>
      </div>
    </>
  );
}
