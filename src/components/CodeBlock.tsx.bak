"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

export default function CodeBlock({ children }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const codeElement = document.querySelector(".code-content");
    if (codeElement) {
      const text = codeElement.textContent || "";
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-white/60" />
        )}
      </button>
      <div className="code-content">{children}</div>
    </div>
  );
}
