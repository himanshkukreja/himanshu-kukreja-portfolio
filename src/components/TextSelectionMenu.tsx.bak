"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bookmark, StickyNote, Highlighter, X } from "lucide-react";

type TextSelectionMenuProps = {
  selectedText: string;
  position: { x: number; y: number };
  onHighlight: (color: string) => void;
  onBookmark: () => void;
  onNote: () => void;
  onClose: () => void;
};

const COLORS = [
  { name: "Yellow", value: "yellow", class: "bg-yellow-400" },
  { name: "Green", value: "green", class: "bg-green-400" },
  { name: "Blue", value: "blue", class: "bg-blue-400" },
  { name: "Pink", value: "pink", class: "bg-pink-400" },
  { name: "Purple", value: "purple", class: "bg-purple-400" },
];

export default function TextSelectionMenu(props: TextSelectionMenuProps) {
  const [showColors, setShowColors] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const menu = (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={props.onClose} />
      <div
        className="fixed z-[9999] bg-gray-900 border-2 border-white/30 rounded-lg shadow-2xl min-w-[250px]"
        style={{ left: `${props.position.x}px`, top: `${props.position.y}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 truncate">
          "{props.selectedText.slice(0, 50)}{props.selectedText.length > 50 ? "..." : ""}"
        </div>
        <div className="p-2">
          {!showColors ? (
            <div className="space-y-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[Menu] Highlight clicked");
                  setShowColors(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded text-white text-sm"
              >
                <Highlighter className="w-4 h-4 text-yellow-400" />
                <span>Highlight</span>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[Menu] Bookmark clicked");
                  props.onBookmark();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded text-white text-sm"
              >
                <Bookmark className="w-4 h-4 text-blue-400" />
                <span>Bookmark</span>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onNote();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded text-white text-sm"
              >
                <StickyNote className="w-4 h-4 text-green-400" />
                <span>Add Note</span>
              </button>
            </div>
          ) : (
            <div className="p-2">
              <div className="flex justify-between mb-3">
                <span className="text-white text-sm font-medium">Choose color</span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColors(false);
                  }}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log("[Menu] Color clicked:", color.value);
                      props.onHighlight(color.value);
                    }}
                    className={`${color.class} w-10 h-10 rounded hover:scale-110 hover:ring-2 hover:ring-white`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(menu, document.body);
}
