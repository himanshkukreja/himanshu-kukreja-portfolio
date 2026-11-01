"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Floating player controls: `wake()` on any pointer or key activity shows them, and `idle` turns
 * true after `ms` without any (the caller hides the controls only while playing).
 */
export function useIdle(ms = 2500) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), ms);
  }, [ms]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { idle, wake };
}
