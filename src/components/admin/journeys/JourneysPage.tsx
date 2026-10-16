"use client";

/**
 * /admin/journeys — PostHog inside the admin: who is on the site right now, every visitor and
 * learner with their timeline, session replays played inline, paths + the learn funnel, and
 * per-page clicks / reading depth with heatmap link-outs. Data comes from /api/admin/posthog/*
 * (server-side PostHog API with the personal key). Without config → the setup card.
 */
import { useSearchParams } from "next/navigation";
import { Badge, PageHead, Skeleton, Tabs, useAdminData } from "@/components/admin/ui";
import type { NotConfigured, PhStatus } from "@/lib/analytics/journeys";
import { ExtLink, useSetParams, PhErrorState } from "./bits";
import SetupCard from "./SetupCard";
import LiveTab from "./LiveTab";
import PeopleTab from "./PeopleTab";
import RecordingsTab from "./RecordingsTab";
import PathsTab from "./PathsTab";
import HeatmapsTab from "./HeatmapsTab";

const TABS = [
  { id: "live", label: "live" },
  { id: "people", label: "people" },
  { id: "recordings", label: "recordings" },
  { id: "paths", label: "paths & funnel" },
  { id: "heatmaps", label: "pages & heatmaps" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const isNotConfigured = (x: unknown): x is NotConfigured => !!x && typeof x === "object" && (x as { configured?: unknown }).configured === false;

export default function JourneysPage() {
  const params = useSearchParams();
  const setParams = useSetParams();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "live";
  const { data: status, error, refresh } = useAdminData<PhStatus>("/api/admin/posthog/status");

  return (
    <div>
      <PageHead
        path="admin/journeys"
        title="Journeys"
        sub="Who comes, what they read, where they click, and their session replays, from PostHog."
        actions={
          status?.configured ? (
            <>
              {!status.capture && <Badge tone="bad" title="NEXT_PUBLIC_POSTHOG_KEY missing in this build: the site isn't sending events">capture off</Badge>}
              {status.ga ? <Badge tone="ok">GA4 on</Badge> : <Badge tone="muted">GA4 off</Badge>}
              <ExtLink href={`${status.uiHost}/project/${status.projectId}`}>PostHog</ExtLink>
            </>
          ) : null
        }
      />
      {error ? (
        <PhErrorState error={error} onRetry={refresh} />
      ) : !status ? (
        <Skeleton className="h-64 w-full" />
      ) : !status.configured ? (
        <SetupCard status={status} />
      ) : (
        <>
          <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={(id) => setParams({ tab: id === "live" ? null : id, person: null, path: null, q: null })} label="Journeys sections" className="mb-5" />
          {tab === "live" && <LiveTab />}
          {tab === "people" && <PeopleTab />}
          {tab === "recordings" && <RecordingsTab />}
          {tab === "paths" && <PathsTab />}
          {tab === "heatmaps" && <HeatmapsTab />}
        </>
      )}
    </div>
  );
}
