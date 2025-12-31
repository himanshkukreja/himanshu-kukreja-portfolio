"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, FileText, Calendar, Award, Target, BookOpen, Loader2 } from "lucide-react";
import Fuse, { FuseResult } from "fuse.js";
import type { LearningResource } from "@/lib/github";

type SearchResult = FuseResult<LearningResource>;

type SearchBarProps = {
  variant?: "bar" | "floating";
};

export default function SearchBar({ variant = "bar" }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [allResources, setAllResources] = useState<LearningResource[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fuse.js configuration for fuzzy search
  const fuseOptions = {
    keys: [
      { name: "title", weight: 2 },
      { name: "week", weight: 1 },
      { name: "type", weight: 0.5 },
      { name: "day", weight: 0.5 },
    ],
    threshold: 0.4, // 0 = exact match, 1 = match anything
    includeScore: true,
    minMatchCharLength: 2,
  };

  // Fetch all resources on mount
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await fetch("/api/search");
        const data = await response.json();
        setAllResources(data.results || []);
      } catch (error) {
        console.error("[SearchBar] Failed to fetch resources:", error);
      }
    };
    fetchResources();
  }, []);

  // Perform fuzzy search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const fuse = new Fuse(allResources, fuseOptions);
    const searchResults = fuse.search(query);
    setResults(searchResults.slice(0, 10)); // Limit to 10 results
    setSelectedIndex(0);
  }, [query, allResources]);

  // Keyboard shortcuts: Cmd+K or Ctrl+K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keyboard navigation in results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      navigateToResult(results[selectedIndex].item);
    }
  };

  // Navigate to selected result
  const navigateToResult = (resource: LearningResource) => {
    const course = "system-design-mastery";
    router.push(`/learn/${course}/${resource.week}/${resource.slug}`);
    setIsOpen(false);
    setQuery("");
  };

  // Format week name for display
  const formatWeekName = (weekKey: string): string => {
    if (weekKey === "overview") return "Overview";
    if (weekKey.includes("foundations")) return "Foundations";

    const match = weekKey.match(/week-(\d+)-(.+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      const topic = match[2]
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return `Week ${num}: ${topic}`;
    }
    return weekKey.replace("week-", "Week ");
  };

  // Get icon for resource type
  const getResourceIcon = (type: string) => {
    switch (type) {
      case "week-preview":
        return <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />;
      case "capstone":
        return <Award className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
      case "foundations":
        return <Target className="w-4 h-4 text-purple-400 flex-shrink-0" />;
      case "overview":
        return <BookOpen className="w-4 h-4 text-green-400 flex-shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-white/60 flex-shrink-0" />;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selected = resultsRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (!isOpen) {
    // Floating button variant (bottom-left corner to avoid focus button)
    if (variant === "floating") {
      return (
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="fixed bottom-6 left-6 z-50 p-3 sm:p-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-full shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/60 transition-all group"
          aria-label="Search content"
        >
          <Search className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </span>
        </button>
      );
    }

    // Bar variant (full-width search bar)
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all group"
      >
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-white/60 group-hover:text-white/80" />
          <span className="text-white/60 text-sm sm:text-base">Search lessons, topics, concepts...</span>
        </div>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white/40">
          <span>⌘</span>
          <span>K</span>
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={() => {
          setIsOpen(false);
          setQuery("");
        }}
      />

      {/* Search Modal */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 px-4">
        <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <Search className="w-5 h-5 text-white/60 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for lessons, topics, or concepts..."
              className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none text-lg"
              autoFocus
            />
            {isLoading && <Loader2 className="w-5 h-5 text-white/60 animate-spin" />}
            <button
              onClick={() => {
                setIsOpen(false);
                setQuery("");
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Search Results */}
          {query && (
            <div
              ref={resultsRef}
              className="max-h-[60vh] overflow-y-auto overscroll-contain"
            >
              {results.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-white/40">No results found for "{query}"</p>
                  <p className="text-white/30 text-sm mt-2">
                    Try searching with different keywords
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {results.map((result, index) => {
                    const resource = result.item;
                    const isSelected = index === selectedIndex;

                    return (
                      <button
                        key={`${resource.week}-${resource.slug}`}
                        onClick={() => navigateToResult(resource)}
                        className={`w-full px-4 py-3 flex items-start gap-3 transition-colors ${
                          isSelected
                            ? "bg-white/10 border-l-2 border-blue-400"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div className="mt-1">{getResourceIcon(resource.type)}</div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 mb-1">
                            <h3
                              className={`font-medium ${
                                isSelected ? "text-white" : "text-white/90"
                              }`}
                            >
                              {resource.title}
                            </h3>
                            {result.score !== undefined && (
                              <span className="text-xs text-white/30">
                                {Math.round((1 - result.score) * 100)}% match
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-white/50">
                            <span>{formatWeekName(resource.week)}</span>
                            {resource.day && (
                              <>
                                <span>•</span>
                                <span>{resource.day.replace("day-", "Day ")}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Footer with shortcuts */}
          {!query && (
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">↵</kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">Esc</kbd>
                  Close
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
