import RefCapture from "@/components/share/RefCapture";

// The course nav lives in the global SiteHeader (learn mode), so this layout adds no chrome.
// RefCapture: links from shared progress pages carry ?ref=<handle>; it keeps the referrer through sign-up.
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefCapture />
      {children}
    </>
  );
}
