import RefCapture from "@/components/share/RefCapture";
import ChatDock from "@/components/learn/chat/ChatDock";
import NotebookPanelHost from "@/components/learn/ink/NotebookPanelHost";
import NotebookFab from "@/components/learn/ink/global/NotebookFab";
import NotebookCoach from "@/components/learn/ink/global/NotebookCoach";

// The course nav lives in the global SiteHeader (learn mode), so this layout adds no chrome.
// RefCapture: links from shared progress pages carry ?ref=<handle>; it keeps the referrer through sign-up.
// ChatDock: the bottom-right corner dock: the Notebook's pen (NotebookFab) stacked above the floating "Ask" button,
//   and the course chat panel (client-only, loaded when opened).
// NotebookPanelHost: the one Notebook panel of the course (opens from the pen, a lesson's reading tools, N), and
//   NotebookCoach, the one-time pointer to it.
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefCapture />
      {children}
      <ChatDock companion={<NotebookFab />} />
      <NotebookPanelHost />
      <NotebookCoach />
    </>
  );
}
