"use client";

import { useEffect, useState, useRef } from "react";
import { Volume2, VolumeX, Pause, Play, Settings2, X, Minimize2 } from "lucide-react";

type ReadAloudProps = {
  contentRef: React.RefObject<HTMLDivElement | null>;
};

export default function ReadAloud({ contentRef }: ReadAloudProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [showSettings, setShowSettings] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textContentRef = useRef<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentHighlightRef = useRef<HTMLSpanElement | null>(null);
  const startElementRef = useRef<HTMLElement | null>(null); // Store where we started reading from

  // Check if Web Speech API is supported
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setIsSupported(true);

      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);

        const englishVoice = availableVoices.find(v => v.lang.startsWith("en"));
        if (englishVoice && !selectedVoice) {
          setSelectedVoice(englishVoice.name);
        }
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [selectedVoice]);

  // Improved highlight text as it's being read (no blinking)
  useEffect(() => {
    if (!isPlaying || isPaused || !contentRef.current) {
      return;
    }

    const content = contentRef.current;

    // Remove previous highlight smoothly
    if (currentHighlightRef.current) {
      const oldSpan = currentHighlightRef.current;
      const parent = oldSpan.parentNode; // Store parent reference before replacing

      if (parent) {
        const textContent = oldSpan.textContent || "";
        const textNode = document.createTextNode(textContent);
        parent.replaceChild(textNode, oldSpan);
        parent.normalize(); // Use stored parent reference
      }
      currentHighlightRef.current = null;
    }

    // If we started from a specific element, only look at content from that point
    let shouldInclude = !startElementRef.current;
    const textNodes: Text[] = [];

    // Get all text nodes (only from start element onwards)
    const walker = document.createTreeWalker(
      content,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;

          // Check if we should start including nodes
          if (!shouldInclude && startElementRef.current) {
            let element = parent;
            while (element) {
              if (element === startElementRef.current) {
                shouldInclude = true;
                break;
              }
              element = element.parentElement;
            }
          }

          if (!shouldInclude) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent && (
            parent.tagName === 'SCRIPT' ||
            parent.tagName === 'STYLE' ||
            parent.tagName === 'CODE' ||
            parent.tagName === 'PRE' ||
            parent.classList.contains('reading-highlight')
          )) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    // Calculate which text node contains current position
    let charCount = 0;
    for (const textNode of textNodes) {
      const text = textNode.textContent || "";
      const nextCharCount = charCount + text.length;

      if (currentCharIndex >= charCount && currentCharIndex < nextCharCount) {
        const relativeIndex = currentCharIndex - charCount;
        const textContent = text;

        // Find sentence boundaries (period, question mark, exclamation)
        let start = 0;
        let end = textContent.length;

        // Find start of current sentence
        for (let i = relativeIndex - 1; i >= 0; i--) {
          if (textContent[i] === '.' || textContent[i] === '?' || textContent[i] === '!') {
            start = i + 1;
            break;
          }
        }

        // Find end of current sentence
        for (let i = relativeIndex; i < textContent.length; i++) {
          if (textContent[i] === '.' || textContent[i] === '?' || textContent[i] === '!') {
            end = i + 1;
            break;
          }
        }

        // Skip whitespace at start
        while (start < end && /\s/.test(textContent[start])) {
          start++;
        }

        if (start < end) {
          // Extract the sentence
          const beforeText = textContent.substring(0, start);
          const highlightText = textContent.substring(start, end);
          const afterText = textContent.substring(end);

          // Create highlight span
          const span = document.createElement('span');
          span.className = 'reading-highlight';
          span.textContent = highlightText;
          span.style.cssText = `
            background: linear-gradient(120deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.35) 100%);
            color: inherit;
            border-radius: 3px;
            padding: 2px 4px;
            box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
            transition: all 0.3s ease;
          `;

          // Replace text node with highlighted version
          const fragment = document.createDocumentFragment();
          if (beforeText) fragment.appendChild(document.createTextNode(beforeText));
          fragment.appendChild(span);
          if (afterText) fragment.appendChild(document.createTextNode(afterText));

          textNode.parentNode?.replaceChild(fragment, textNode);

          // Store reference to current highlight
          currentHighlightRef.current = span;

          // Don't auto-scroll - let user control their reading position
          // The highlight will appear wherever the text is being read
        }
        break;
      }

      charCount = nextCharCount;
    }
  }, [currentCharIndex, isPlaying, isPaused]);

  // Find the first visible heading or paragraph on screen
  const findVisibleStartElement = (): HTMLElement | null => {
    if (!contentRef.current) return null;

    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const viewportMiddle = viewportTop + (window.innerHeight / 3); // Top third of viewport

    // Get all headings and paragraphs
    const elements = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6, p');

    for (const element of Array.from(elements)) {
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;

      // Find first element that's in the top third of viewport
      if (elementTop >= viewportTop && elementTop <= viewportMiddle) {
        return element as HTMLElement;
      }
    }

    // Fallback: find first element in viewport
    for (const element of Array.from(elements)) {
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;

      if (elementTop >= viewportTop && elementTop <= viewportBottom) {
        return element as HTMLElement;
      }
    }

    return null;
  };

  const extractTextContent = (startFromElement?: HTMLElement | null) => {
    if (!contentRef.current) return "";
    const clone = contentRef.current.cloneNode(true) as HTMLElement;

    // Remove elements we don't want to read
    clone.querySelectorAll("pre, code, img, script, style").forEach(el => el.remove());

    let text = "";
    let shouldInclude = !startFromElement; // If no start element, include everything

    // If we have a start element, find its match in the cloned content
    let startMarker: Element | null = null;
    if (startFromElement) {
      // Find the matching element in clone by comparing text content and tag name
      const originalTag = startFromElement.tagName.toLowerCase();
      const originalText = startFromElement.textContent?.trim().substring(0, 50) || "";

      const candidates = clone.querySelectorAll(originalTag);
      for (const candidate of Array.from(candidates)) {
        const candidateText = candidate.textContent?.trim().substring(0, 50) || "";
        if (candidateText === originalText) {
          startMarker = candidate;
          break;
        }
      }
    }

    // Process each element to preserve structure and add pauses
    const processNode = (node: Node): void => {
      // Check if we've reached the start marker
      if (startMarker && node === startMarker) {
        shouldInclude = true;
      }

      // Only process if we should include this content
      if (!shouldInclude) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          element.childNodes.forEach(child => processNode(child));
        }
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const content = node.textContent || "";
        if (content.trim()) {
          text += content.trim() + " ";
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();

        // Add pauses for block-level elements (paragraphs, headings, divs)
        if (['p', 'div', 'section', 'article'].includes(tagName)) {
          // Process children
          element.childNodes.forEach(child => processNode(child));
          text += ". "; // Add period and space for paragraph pause
        }
        // Add pauses and structure for headings
        else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          text += "\n\n"; // Double line break before heading
          element.childNodes.forEach(child => processNode(child));
          text += ". "; // Pause after heading
        }
        // Add structure for list items
        else if (tagName === 'li') {
          text += "\n"; // Line break for list item
          element.childNodes.forEach(child => processNode(child));
          text += ". "; // Pause after each list item
        }
        // Add pauses for lists
        else if (['ul', 'ol'].includes(tagName)) {
          text += ". "; // Pause before list
          element.childNodes.forEach(child => processNode(child));
          text += ". "; // Pause after list
        }
        // Line breaks
        else if (tagName === 'br') {
          text += ". "; // Add pause for line break
        }
        // Blockquotes
        else if (tagName === 'blockquote') {
          text += ". "; // Pause before quote
          element.childNodes.forEach(child => processNode(child));
          text += ". "; // Pause after quote
        }
        // Tables (add structure)
        else if (tagName === 'td' || tagName === 'th') {
          element.childNodes.forEach(child => processNode(child));
          text += ", "; // Comma between table cells
        }
        else if (tagName === 'tr') {
          element.childNodes.forEach(child => processNode(child));
          text += ". "; // Pause after table row
        }
        // Default: process children
        else {
          element.childNodes.forEach(child => processNode(child));
        }
      }
    };

    // Start processing from the cloned content
    clone.childNodes.forEach(node => processNode(node));

    // Clean up the text
    text = text
      .replace(/\n+/g, ". ") // Convert line breaks to pauses
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .replace(/\.\s*\.\s*/g, ". ") // Remove duplicate periods
      .replace(/,\s*\./g, ".") // Clean up comma-period combinations
      .replace(/\s+\./g, ".") // Remove spaces before periods
      .trim();

    return text;
  };

  const cleanupHighlights = () => {
    if (!contentRef.current) return;

    contentRef.current.querySelectorAll('.reading-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ""), el);
        parent.normalize();
      }
    });
    currentHighlightRef.current = null;
  };

  const startReading = () => {
    if (!isSupported || !contentRef.current) return;

    window.speechSynthesis.cancel();
    cleanupHighlights();

    // Find visible element to start from
    const visibleElement = findVisibleStartElement();

    // Store the start element for highlight syncing
    startElementRef.current = visibleElement;

    // Extract text starting from visible element (or from beginning if at top)
    const text = extractTextContent(visibleElement);
    if (!text) {
      alert("No content to read!");
      return;
    }

    console.log("[ReadAloud] Starting from:", visibleElement ? visibleElement.tagName + ": " + visibleElement.textContent?.substring(0, 50) : "beginning");

    textContentRef.current = text;
    setCurrentCharIndex(0);

    const utterance = new SpeechSynthesisUtterance(text);

    if (selectedVoice) {
      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    // Track character position with debouncing
    let lastCharIndex = 0;
    utterance.onboundary = (event) => {
      if (event.name === 'word' && event.charIndex !== lastCharIndex) {
        lastCharIndex = event.charIndex;
        setCurrentCharIndex(event.charIndex);
      }
    };

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentCharIndex(0);
      cleanupHighlights();
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
      cleanupHighlights();
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const pauseReading = () => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const resumeReading = () => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  };

  const stopReading = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentCharIndex(0);
    startElementRef.current = null; // Reset start element
    cleanupHighlights();
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (isPlaying && !isPaused) {
      stopReading();
      setTimeout(() => startReading(), 100);
    }
  };

  const handlePitchChange = (newPitch: number) => {
    setPitch(newPitch);
    if (isPlaying && !isPaused) {
      stopReading();
      setTimeout(() => startReading(), 100);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (isPlaying && !isPaused) {
      stopReading();
      setTimeout(() => startReading(), 100);
    }
  };

  if (!isSupported) {
    return null;
  }

  // If minimized, show only a small floating button
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 right-6 z-40">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-3 bg-blue-500/90 hover:bg-blue-600 rounded-full shadow-lg border border-blue-400/30 transition-all backdrop-blur-sm"
          title="Show Read Aloud"
        >
          <Volume2 className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Minimalistic Floating Controls - Positioned to avoid overlap, lower on mobile */}
      <div className="fixed bottom-6 lg:bottom-20 right-4 sm:right-6 z-40 flex flex-col items-end gap-2">
        {/* Enhanced Settings Panel - Shows only when settings button clicked */}
        {showSettings && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-black/10 dark:border-white/10 shadow-2xl p-4 w-72 mb-2 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {isPaused ? '⏸️ Paused - Adjust Settings' : 'Read Aloud Settings'}
              </h4>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>

            {/* Voice Selection */}
            <div className="mb-3">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                🎤 Voice
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {voices.filter(v => v.lang.startsWith('en')).map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name.split(' ').slice(0, 2).join(' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Speed Control */}
            <div className="mb-3">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                ⚡ Speed: {rate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={rate}
                onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>0.5x Slow</span>
                <span>1.0x</span>
                <span>2.0x Fast</span>
              </div>
            </div>

            {/* Pitch Control */}
            <div className="mb-3">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                🎵 Pitch: {pitch.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={pitch}
                onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>Low</span>
                <span>Normal</span>
                <span>High</span>
              </div>
            </div>

            {/* Volume Control */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                🔊 Volume: {Math.round(volume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>🔇 0%</span>
                <span>50%</span>
                <span>🔊 100%</span>
              </div>
            </div>

            {/* Quick Presets */}
            {isPaused && (
              <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                  ⚙️ Quick Presets
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setRate(1.0);
                      setPitch(1.0);
                      setVolume(1.0);
                    }}
                    className="px-2 py-1.5 text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded transition-colors"
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => {
                      setRate(1.5);
                      setPitch(1.0);
                      setVolume(1.0);
                    }}
                    className="px-2 py-1.5 text-[10px] bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 rounded transition-colors"
                  >
                    Fast
                  </button>
                  <button
                    onClick={() => {
                      setRate(0.75);
                      setPitch(0.9);
                      setVolume(1.0);
                    }}
                    className="px-2 py-1.5 text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded transition-colors"
                  >
                    Relaxed
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Control Buttons */}
        <div className="flex items-center gap-2">
          {/* Minimize Button */}
          {(isPlaying || showSettings) && (
            <button
              onClick={() => {
                setIsMinimized(true);
                setShowSettings(false);
              }}
              className="p-2 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full shadow-lg border border-black/10 dark:border-white/10 transition-all"
              title="Minimize"
            >
              <Minimize2 className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
            </button>
          )}

          {/* Settings Icon - Shows when NOT playing OR when paused */}
          {(!isPlaying || isPaused) && !showSettings && (
            <button
              onClick={() => setShowSettings(true)}
              className="p-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full shadow-lg border border-black/10 dark:border-white/10 transition-all"
              title="Settings"
            >
              <Settings2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}

          {/* Playing Controls */}
          {isPlaying && (
            <>
              <button
                onClick={stopReading}
                className="p-2 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full shadow-lg border border-black/10 dark:border-white/10 transition-all"
                title="Stop"
              >
                <VolumeX className="w-4 h-4 text-red-500" />
              </button>

              {isPaused ? (
                <button
                  onClick={resumeReading}
                  className="p-3.5 bg-green-500 hover:bg-green-600 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95"
                  title="Resume"
                >
                  <Play className="w-5 h-5 text-white" />
                </button>
              ) : (
                <button
                  onClick={pauseReading}
                  className="p-3.5 bg-yellow-500 hover:bg-yellow-600 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95"
                  title="Pause"
                >
                  <Pause className="w-5 h-5 text-white" />
                </button>
              )}
            </>
          )}

          {/* Start Button */}
          {!isPlaying && (
            <button
              onClick={startReading}
              className="p-4 bg-blue-500 hover:bg-blue-600 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95"
              title="Start Reading"
            >
              <Volume2 className="w-5 h-5 text-white" />
            </button>
          )}
        </div>

        {/* Status Badge */}
        {isPlaying && (
          <div className="px-3 py-1 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-full border border-black/10 dark:border-white/10 shadow-lg">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`} />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                {isPaused ? 'Paused' : 'Reading'}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
