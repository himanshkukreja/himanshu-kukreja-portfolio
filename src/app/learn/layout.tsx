import RefCapture from "@/components/share/RefCapture";
import ChatDock from "@/components/learn/chat/ChatDock";

// The course nav lives in the global SiteHeader (learn mode), so this layout adds no chrome.
// RefCapture: links from shared progress pages carry ?ref=<handle>; it keeps the referrer through sign-up.
// ChatDock: the floating "Ask" button and the course chat panel (client-only, loaded when opened).
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefCapture />
      {children}
      <ChatDock />
    </>
  );
}
