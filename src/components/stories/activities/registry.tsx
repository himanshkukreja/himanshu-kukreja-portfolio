"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { CaseActivityData } from "./data";

export type ActivityProps = { slug: string; caseId: string };

function Loading() {
  return (
    <div aria-hidden className="h-[260px] border border-line-strong bg-surface">
      <div className="h-[38px] border-b border-line bg-bg" />
    </div>
  );
}


// One lazily loaded chunk per story, so a reader only downloads the activity for the case they are on.
const ACTIVITIES: Record<string, ComponentType<ActivityProps>> = {
  "irctc-tatkal-500-seats-2-million-users": dynamic(() => import("./RushControlRoom"), { loading: Loading }),
  "integer-overflow-auto-increment-crisis": dynamic(() => import("./IdBurnDown"), { loading: Loading }),
  "leader-follower-replication-node-outages": dynamic(() => import("./FailoverDrill"), { loading: Loading }),
  "cdn-cache-poisoning-disaster": dynamic(() => import("./CacheLeak"), { loading: Loading }),
  "digipin-scalable-location-service": dynamic(() => import("./BinaryDance"), { loading: Loading }),
  "scalable-spam-detection-bloom-filter": dynamic(() => import("./BloomHunt"), { loading: Loading }),
  "distributed-transactions-2pc-saga-pattern": dynamic(() => import("./BookEverything"), { loading: Loading }),
  "websockets-vs-webrtc-video-communication": dynamic(() => import("./PickThePipe"), { loading: Loading }),
  "ios-bridge-cross-platform-streaming": dynamic(() => import("./FeelTheLag"), { loading: Loading }),
  "bridgelink-remote-android-testing": dynamic(() => import("./WireTheTunnel"), { loading: Loading }),
};

// CMS case files (admin → Case files) carry their activity as data; one shared chunk renders all of them.
const DataActivity = dynamic(() => import("./DataActivity"), { loading: Loading });

/** The interactive debrief at the end of a case file, or nothing if the story has none. */
export default function CaseActivity({ slug, caseId, data }: ActivityProps & { data?: CaseActivityData | null }) {
  if (data && data.steps.length) return <DataActivity slug={slug} caseId={caseId} data={data} />;
  const Activity = ACTIVITIES[slug];
  if (!Activity) return null;
  return <Activity slug={slug} caseId={caseId} />;
}
