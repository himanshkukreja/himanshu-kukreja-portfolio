"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

/**
 * Dark is the default. A visitor's own pick (the header toggle) is stored by next-themes in
 * localStorage("theme") and wins on every later visit; its inline script applies the class before
 * first paint, so there is no flash. The OS setting is deliberately not followed.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={["light", "dark"]} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
