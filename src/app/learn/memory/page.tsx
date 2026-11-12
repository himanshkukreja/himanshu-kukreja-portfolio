import TutorMemory from "@/components/learn/chat/TutorMemory";

export const runtime = "nodejs";
// A static shell: the memory is the learner's own and loads on the client from /api/learn/ai/chat/memory.
export const revalidate = 86400;

export const metadata = {
  title: "What the AI knows · Learn · Himanshu Kukreja",
  description: "What the System Design Mastery tutors and AI features know about your learning, where each note came from, and how to edit, forget or clear it.",
  robots: { index: false, follow: true },
};

export default function TutorMemoryPage() {
  return <TutorMemory />;
}
