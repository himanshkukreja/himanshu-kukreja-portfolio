import type { Metadata } from "next";
import ProjectArcade from "@/components/arcade/ProjectArcade";

export const metadata: Metadata = {
  title: "Project Arcade · Himanshu Kukreja",
  description:
    "Every project is a cartridge: SIA, Markdrop, Chukta, iOS Bridge, BridgeLink, Waygate, Obscura and codeflow-analyzer, each with a 30-second playable demo.",
};

export default function ProjectsPage() {
  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 sm:pb-24 sm:pt-14">
      <ProjectArcade />
    </main>
  );
}
