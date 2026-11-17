"use client";

/** "Try it free, sign in": the sign-in gate card's look (SignInGate.tsx), at the end of /ai-tutor. A signed-in learner gets the way into the tutor instead. */
import Link from "next/link";
import { useId } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSignInGate } from "@/components/gate/SignInGate";

export default function TutorCta({ course }: { course: "sdm" | "dsa" }) {
  const { user, loading } = useAuth();
  const { ask } = useSignInGate("ai-tutor");
  const titleId = useId();
  const member = !loading && !!user;
  const radius = course === "dsa" ? "rounded-2xl" : "";
  return (
    <section aria-labelledby={titleId} className={`relative w-full max-w-[760px] border border-line bg-raised p-5 sm:p-7 ${radius}`}>
      <div className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {member ? "your tutor" : "free for now"}
        </span>
        <h2 id={titleId} className="m-0 font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.035em] text-fg sm:text-[30px]">
          {member ? "Ask it something" : "Try it free"}
          <span className="text-signal-text">.</span>
        </h2>
        <p className="m-0 text-[15px] leading-relaxed text-fg-2">
          {member ? "Open the tutor and pick up where you left off." : "Sign in, ask your first question, and the tutor starts learning how you learn."}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {member ? (
            <Link href={course === "dsa" ? "/dsa/ask" : "/chat"} className="inline-flex min-h-[48px] items-center bg-signal px-6 font-semibold text-on-signal hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
              Open the tutor
            </Link>
          ) : (
            <>
              <button type="button" onClick={() => ask("ai-tutor")} className="min-h-[48px] bg-signal px-6 font-semibold text-on-signal hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                Try it free, sign in
              </button>
              <span className="font-mono text-[11px] text-fg-3">Google or email · takes a few seconds</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
