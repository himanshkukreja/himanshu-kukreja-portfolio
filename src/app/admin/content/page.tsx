"use client";

/** /admin/content — newsletter, contact queries, comment moderation, users, send logs, story stats. */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { PageHead, Tabs } from "@/components/admin/ui";
import NewsletterTab from "@/components/admin/content/NewsletterTab";
import ContactTab from "@/components/admin/content/ContactTab";
import CommentsTab from "@/components/admin/content/CommentsTab";
import UsersTab from "@/components/admin/content/UsersTab";
import LogsTab from "@/components/admin/content/LogsTab";
import StoriesTab from "@/components/admin/content/StoriesTab";
import AnnounceTab from "@/components/admin/content/AnnounceTab";
import { FlashLine, useFlash } from "@/components/admin/content/common";

const TABS = [
  { id: "newsletter", label: "newsletter" },
  { id: "announce", label: "announce" },
  { id: "contact", label: "contact" },
  { id: "comments", label: "comments" },
  { id: "users", label: "users" },
  { id: "logs", label: "logs" },
  { id: "stories", label: "stories" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const isTab = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

export default function AdminContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: TabId = isTab(raw) ? raw : "newsletter";
  const openQuery = params.get("q");
  const { flash, say, clear } = useFlash();

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname]
  );

  return (
    <div>
      <PageHead path="sudo ~/admin/content" title="Content" sub="Newsletter, inbox, comments, accounts and case-file readership." />
      <Tabs label="Content sections" tabs={[...TABS]} value={tab} onChange={(id) => setParams({ tab: id, q: null })} className="mb-5" />
      {tab === "newsletter" && <NewsletterTab say={say} />}
      {tab === "announce" && <AnnounceTab say={say} />}
      {tab === "contact" && <ContactTab say={say} openId={openQuery} onOpen={(id) => setParams({ q: id })} />}
      {tab === "comments" && <CommentsTab say={say} />}
      {tab === "users" && <UsersTab />}
      {tab === "logs" && <LogsTab say={say} />}
      {tab === "stories" && <StoriesTab />}
      <FlashLine flash={flash} onDismiss={clear} />
    </div>
  );
}
