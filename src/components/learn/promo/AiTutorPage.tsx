import Link from "next/link";
import { BookOpen, Brain, CalendarCheck, Lightbulb } from "lucide-react";
import InlineVideo from "@/components/learn/guide/videos/InlineVideo";
import { ChatFinePrint, DSA_PRIVACY } from "@/components/learn/chat/ChatMeta";
import { promoVideo } from "@/lib/learn/guide/videos";
import TutorCta from "./TutorCta";

/**
 * /ai-tutor (SDM) and /dsa/ai-tutor: the 8-minute demo with its chapters (tap one to seek), a short intro, the four things the tutor
 * does as cards, and "Try it free, sign in". One component, the course's own theme around it (DSA wraps it in .dsa-theme).
 */
const CARDS = [
  { icon: CalendarCheck, title: "A plan from your progress", body: "Four weeks, an hour a day: it reads what you have finished and lays out each day." },
  { icon: BookOpen, title: "Answers from the lesson", body: "Ask while you read. Answers quote the course with their sources, and say so when it isn't covered." },
  { icon: Lightbulb, title: "Hints that never spoil", body: "Stuck on a problem? It points at the bug and the idea, not the finished solution." },
  { icon: Brain, title: "It remembers you", body: "Missed points come back as review, a mock ends in a scorecard, and a break gets a recap plan." },
] as const;

export default function AiTutorPage({ course }: { course: "sdm" | "dsa" }) {
  const demo = promoVideo("ai-demo");
  const dsa = course === "dsa";
  const radius = dsa ? "rounded-2xl" : "";
  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-24 pt-8 sm:gap-12 sm:px-6 sm:pt-14">
      <header className="flex max-w-[720px] flex-col gap-3 sm:gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">AI tutor · {dsa ? "DSA Mastery" : "System Design Mastery"}</span>
        <h1 className="m-0 font-display text-[clamp(40px,6.4vw,84px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
          One tutor that learns you<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Ask the lesson, get a hint without the spoiler, and come back after a break to a plan. Watch three learners use it, with real answers.
        </p>
      </header>

      {demo && (
        <section aria-label="The demo" className={`${radius}`}>
          <InlineVideo video={demo} from={`ai-tutor-${course}`} priority sizes="(min-width: 1100px) 1052px, 100vw" />
        </section>
      )}

      <section aria-labelledby="tutor-does-h" className="flex flex-col gap-4">
        <h2 id="tutor-does-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.03em] text-fg sm:text-[34px]">
          What it does
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
            <li key={c.title} className={`flex flex-col gap-2 border border-line bg-surface p-4 sm:p-5 ${radius}`}>
              <c.icon className="h-5 w-5 text-signal-text" aria-hidden />
              <h3 className="m-0 font-display text-[19px] font-bold leading-[1.1] tracking-[-0.02em] text-fg">{c.title}</h3>
              <p className="m-0 text-[14px] leading-snug text-fg-2">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-3">
        <TutorCta course={course} />
        <ChatFinePrint memory={null} privacy={dsa ? DSA_PRIVACY : undefined} />
      </div>

      <p className="m-0 font-mono text-[12px] text-fg-3">
        <Link href={dsa ? "/dsa" : "/"} className="underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          ← back to {dsa ? "DSA Mastery" : "the course"}
        </Link>
      </p>
    </main>
  );
}
