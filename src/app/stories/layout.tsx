import ChatDock from "@/components/learn/chat/ChatDock";
import NotebookPanelHost from "@/components/learn/ink/NotebookPanelHost";
import NotebookFab from "@/components/learn/ink/global/NotebookFab";
import NotebookCoach from "@/components/learn/ink/global/NotebookCoach";

// Case files are course content: the course chat's panel opens here too (Explain / Ask the tutor on a passage), and
// so does the Notebook (the pen above the case file's own Ask AI button, N, clip and snip).
export default function StoriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatDock companion={<NotebookFab />} />
      <NotebookPanelHost />
      <NotebookCoach />
    </>
  );
}
