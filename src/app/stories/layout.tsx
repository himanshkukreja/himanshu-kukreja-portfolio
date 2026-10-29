import ChatDock from "@/components/learn/chat/ChatDock";

// Case files are course content: the course chat's panel opens here too (Explain / Ask the tutor on a passage).
export default function StoriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatDock />
    </>
  );
}
