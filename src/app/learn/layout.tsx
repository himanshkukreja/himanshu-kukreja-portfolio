import RefCapture from "@/components/share/RefCapture";
import ChatDock from "@/components/learn/chat/ChatDock";
import NotebookPanelHost from "@/components/learn/ink/NotebookPanelHost";
import NotebookFab from "@/components/learn/ink/global/NotebookFab";
import NotebookCoach from "@/components/learn/ink/global/NotebookCoach";
import GuideVideoHost from "@/components/learn/guide/videos/GuideVideoHost";
import { GUIDE_VIDEOS_ON } from "@/lib/learn/guide/videos";
import { COURSE_LAYOUT_METADATA } from "@/lib/site/course-metadata";

// every course page is canonical on the course host (systemdesignmastery.dev)
export const metadata = COURSE_LAYOUT_METADATA;

// The course nav lives in the global SiteHeader (learn mode), so this layout adds no chrome.
// RefCapture: links from shared progress pages carry ?ref=<handle>; it keeps the referrer through sign-up.
// ChatDock: the bottom-right corner dock: the Notebook's pen (NotebookFab) stacked above the floating "Ask" button,
//   and the course chat panel (client-only, loaded when opened).
// NotebookPanelHost: the one Notebook panel of the course (opens from the pen, a lesson's reading tools, N), and
//   NotebookCoach, the one-time pointer to it.
// GuideVideoHost: the feature-video player (openGuideVideo / #watch-<id>), only with NEXT_PUBLIC_GUIDE_VIDEOS=1.
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefCapture />
      {children}
      <ChatDock companion={<NotebookFab />} />
      <NotebookPanelHost />
      <NotebookCoach />
      {GUIDE_VIDEOS_ON && <GuideVideoHost />}
    </>
  );
}
