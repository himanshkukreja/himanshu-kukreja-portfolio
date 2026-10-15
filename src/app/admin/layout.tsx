import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import AdminShell from "@/components/admin/shell/AdminShell";

export const metadata: Metadata = {
  title: "Admin · ~/himanshu",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** Server layout: noindex metadata; the client AdminShell gates on the admin session. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
