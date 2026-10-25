import type { ReactNode } from "react";
import YouNav from "@/components/learn/you/YouNav";

/** Part of the You tab: the shared row for progress, notebook, concept mastery and certificates. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <YouNav />
      {children}
    </>
  );
}
