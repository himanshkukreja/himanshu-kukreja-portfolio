"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

/**
 * Light is the default (the owner's call, 29 Oct 2026; it was dark before). A visitor's own pick (the header toggle) is stored by next-themes in
 * localStorage("theme") and wins on every later visit. The OS setting is deliberately not followed.
 *
 * next-themes keeps the site theme in html[data-theme]; the `dark` class is the page's tone, owned by the
 * reading modes (src/lib/learn/readingModes.ts): the site theme everywhere except on reading pages with a
 * reading mode picked. Its inline script in <head> (READING_JS) sets the class before first paint, so
 * there is no flash; components/learn/reading/ReadingModeHost keeps it in step afterwards.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="light" enableSystem={false} enableColorScheme={false} themes={["light", "dark"]} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
