"use client";

import { useRef, useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Code,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Eye,
  Edit3,
} from "lucide-react";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  minHeight?: string;
  autoFocus?: boolean;
};

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your comment...",
  minHeight = "120px",
  autoFocus = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText;
    setLocalValue(html);
    onChange(html, text);
  };

  // Track selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString() || "";
      setHasSelection(selectedText.length > 0);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // Prevent focus mode shortcut when typing in editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editorRef.current && editorRef.current.contains(e.target as Node)) {
        // Stop propagation of 'f' key when typing in editor
        if (e.key === 'f' || e.key === 'F') {
          e.stopPropagation();
        }
      }
    };

    const editor = editorRef.current;
    if (editor) {
      editor.addEventListener('keydown', handleKeyDown);
      return () => editor.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  // Update editor content when switching from preview to edit
  useEffect(() => {
    if (!showPreview && editorRef.current && localValue) {
      editorRef.current.innerHTML = localValue;
    }
  }, [showPreview]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertCodeBlock = () => {
    if (!editorRef.current) return;

    // Create a code block with placeholder
    const pre = document.createElement("pre");
    const codeElement = document.createElement("code");
    codeElement.textContent = "// Type your code here";
    codeElement.className = "block bg-black/5 dark:bg-white/5 p-3 rounded-md my-2 overflow-x-auto text-sm font-mono";
    codeElement.contentEditable = "true";
    codeElement.style.outline = "none";
    pre.appendChild(codeElement);

    // Insert at cursor position or end
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
      
      // Add a line break after for easier editing
      const br = document.createElement("br");
      pre.parentNode?.insertBefore(br, pre.nextSibling);
      
      // Focus the code element
      setTimeout(() => {
        codeElement.focus();
        // Select all placeholder text
        const range = document.createRange();
        range.selectNodeContents(codeElement);
        selection.removeAllRanges();
        selection.addRange(range);
      }, 0);
    } else {
      editorRef.current.appendChild(pre);
      const br = document.createElement("br");
      editorRef.current.appendChild(br);
      codeElement.focus();
    }

    handleInput();
  };

  const insertLink = () => {
    const selection = window.getSelection();
    if (!selection || !editorRef.current || !containerRef.current) return;
    
    // Check if user clicked on an existing link
    let existingLink: HTMLAnchorElement | null = null;
    let selectedText = selection.toString();
    const range = selection.getRangeAt(0);
    
    // Check if the selection or its parent is a link
    const parentElement = range.commonAncestorContainer.parentElement;
    if (parentElement?.tagName === "A") {
      existingLink = parentElement as HTMLAnchorElement;
      selectedText = existingLink.textContent || "";
    }
    
    if (!selectedText) {
      return;
    }

    // Get the position of the selection for positioning the input
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    
    // Create a temporary input for URL
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Paste or type URL here (e.g., example.com)...";
    input.value = existingLink ? existingLink.href : "https://";
    input.className = "absolute z-50 px-3 py-2 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg shadow-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
    input.style.width = "300px";
    
    // Position near the selected text
    const top = rect.bottom - editorRect.top + 5;
    const left = Math.max(0, Math.min(rect.left - editorRect.left, editorRect.width - 310));
    input.style.top = `${top}px`;
    input.style.left = `${left}px`;
    
    containerRef.current.appendChild(input);
    input.focus();
    
    // Select the domain part (after https://)
    if (!existingLink) {
      input.setSelectionRange(8, input.value.length);
    } else {
      input.select();
    }
    
    const createLink = () => {
      let url = input.value.trim();
      if (url && url !== "https://") {
        // Auto-add https:// if missing protocol
        if (!url.match(/^https?:\/\//i)) {
          url = "https://" + url;
        }
        
        // If editing existing link, replace it
        if (existingLink) {
          existingLink.href = url;
          existingLink.textContent = selectedText;
        } else {
          // Create new link element
          const link = document.createElement("a");
          link.href = url;
          link.textContent = selectedText;
          link.className = "text-blue-500 underline hover:text-blue-600";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          
          // Insert the link
          range.deleteContents();
          range.insertNode(link);
          
          // Move cursor after link
          range.setStartAfter(link);
          range.setEndAfter(link);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        
        handleInput();
      }
      if (containerRef.current?.contains(input)) {
        containerRef.current.removeChild(input);
      }
    };
    
    const cancelLink = () => {
      if (containerRef.current?.contains(input)) {
        containerRef.current.removeChild(input);
      }
      editorRef.current?.focus();
    };
    
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        createLink();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelLink();
      }
    });
    
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (containerRef.current?.contains(input)) {
          cancelLink();
        }
      }, 200);
    });
  };

  const ToolbarButton = ({
    onClick,
    icon: Icon,
    title,
    active = false,
    disabled = false,
  }: {
    onClick: () => void;
    icon: any;
    title: string;
    active?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-2 rounded transition-colors ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : active
          ? "bg-blue-500/20 text-blue-500"
          : "text-gray-600 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10"
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div ref={containerRef} className="relative border border-black/10 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-black/20">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex-wrap">
        <ToolbarButton onClick={() => execCommand("bold")} icon={Bold} title="Bold (Ctrl+B)" />
        <ToolbarButton onClick={() => execCommand("italic")} icon={Italic} title="Italic (Ctrl+I)" />
        <ToolbarButton onClick={() => execCommand("insertUnorderedList")} icon={List} title="Bullet List" />
        <ToolbarButton onClick={() => execCommand("insertOrderedList")} icon={ListOrdered} title="Numbered List" />
        <ToolbarButton onClick={() => execCommand("formatBlock", "blockquote")} icon={Quote} title="Quote" />
        <ToolbarButton onClick={insertCodeBlock} icon={Code} title="Code Block" />
        <ToolbarButton onClick={insertLink} icon={LinkIcon} title="Insert Link (select text first)" disabled={!hasSelection} />
        
        <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-1" />
        
        <ToolbarButton onClick={() => execCommand("undo")} icon={Undo} title="Undo" />
        <ToolbarButton onClick={() => execCommand("redo")} icon={Redo} title="Redo" />
        
        <div className="flex-1" />
        
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            showPreview
              ? "bg-blue-500 text-white"
              : "bg-black/10 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:bg-black/20 dark:hover:bg-white/20"
          }`}
        >
          {showPreview ? (
            <>
              <Edit3 className="w-3 h-3" />
              Edit
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" />
              Preview
            </>
          )}
        </button>
      </div>

      {/* Editor/Preview */}
      {showPreview ? (
        <div
          className="p-3 prose prose-sm dark:prose-invert max-w-none overflow-auto"
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: localValue || `<p class="text-gray-400">${placeholder}</p>` }}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          className="p-3 outline-none prose prose-sm dark:prose-invert max-w-none overflow-auto"
          style={{ minHeight }}
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      )}

      <style jsx>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        
        [contenteditable] pre code {
          display: block;
          background: rgba(0, 0, 0, 0.05);
          padding: 0.75rem;
          border-radius: 0.375rem;
          margin: 0.5rem 0;
          overflow-x: auto;
          font-size: 0.875rem;
          font-family: ui-monospace, monospace;
        }
        
        :global(.dark) [contenteditable] pre code {
          background: rgba(255, 255, 255, 0.05);
        }
        
        [contenteditable] a {
          color: #3b82f6;
          text-decoration: underline;
        }
        
        [contenteditable] blockquote {
          border-left: 4px solid #d1d5db;
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: #6b7280;
        }
        
        :global(.dark) [contenteditable] blockquote {
          border-color: #4b5563;
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
}
