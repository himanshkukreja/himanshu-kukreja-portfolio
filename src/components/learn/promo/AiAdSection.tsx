"use client";

/**
 * "See what the AI tutor does": the 2-minute ad ("It remembers") on both course landings, after the hero. Guests only (CSS,
 * html.hk-guest, like the sign-in card), so a learner's dashboard stays a dashboard.
 *
 * Nothing loads or plays until a tap: a poster, a play button and the length. On a phone (below 640 px) the poster is a small
 * 9:16 thumbnail beside the title and the tap opens the 49 s 9:16 cut full width; from 640 px up it is the 16:9 cut beside
 * the text. Both posters are in the markup (CSS picks one, so there is no layout jump), and the tap reads the width to pick
 * the cut. The player is the lecture/guide player (GuidePlayer): captions, speed, chapters bar, full screen.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useId, useState } from "react";
import { Play } from "lucide-react";
import { AD_VERTICAL_SECONDS, fmtClock, promoVideo, type GuideVideo } from "@/lib/learn/guide/videos";

const GuidePlayer = dynamic(() => import("@/components/learn/guide/videos/GuidePlayer"), { ssr: false, loading: () => <div className="aspect-video w-full bg-black" /> });

export type PromoCourse = "sdm" | "dsa";

const PLAY_BTN = "grid h-11 w-11 place-items-center bg-signal text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.3)] transition-transform group-hover:scale-105 motion-reduce:transition-none";

export default function AiAdSection({ course }: { course: PromoCourse }) {
  const ad = promoVideo("ai-ad");
  const [mode, setMode] = useState<null | "wide" | "tall">(null);
  const titleId = useId();
  if (!ad) return null;
  const tall = !!ad.vertical && !!ad.posterVertical;
  const dsa = course === "dsa";
  const more = dsa ? "/dsa/ai-tutor" : "/ai-tutor";
  const radius = dsa ? "rounded-2xl" : "";

  const open = () => {
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
    setMode(phone && tall ? "tall" : "wide");
  };

  // the 9:16 cut: its own file and poster; its captions are burned in, so no track
  const vertical: GuideVideo | null = tall ? { ...ad, src: ad.vertical!, poster: ad.posterVertical!, captions: null, chapters: [], duration: AD_VERTICAL_SECONDS } : null;

  return (
    <section
      aria-labelledby={titleId}
      data-promo="ai-ad"
      className={`hk-guest-only items-center gap-3.5 border border-line bg-surface p-3 sm:gap-6 sm:p-5 ${radius} ${
        mode === "tall" ? "grid-cols-1" : "grid-cols-[96px_minmax(0,1fr)] sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      }`}
    >
      <div className="order-2 flex min-w-0 flex-col gap-2 sm:order-1 sm:gap-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">AI tutor · both courses</span>
        <h2 id={titleId} className="m-0 font-display text-[22px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[34px]">
          See what the AI tutor does<span className="text-signal-text">.</span>
        </h2>
        <p className="m-0 text-[14px] leading-snug text-fg-2 sm:text-[16px]">It remembers what you got wrong and teaches from it.</p>
        <Link href={more} className="inline-flex min-h-10 items-center self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          How it works<span className="hidden sm:inline">, in 8 minutes</span> →
        </Link>
      </div>

      <div className={`order-1 min-w-0 sm:order-2 ${mode === "tall" ? "mx-auto w-full max-w-[340px]" : "w-full sm:max-w-[620px] sm:justify-self-end"}`}>
        {mode === null ? (
          <>
            {/* 16:9 (640 px and up) */}
            <button
              type="button"
              onClick={open}
              aria-label={`Play the video: ${ad.title} (${fmtClock(ad.duration)}, with sound)`}
              className={`group relative hidden aspect-video w-full overflow-hidden border border-line bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:block ${radius}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the ad's own poster, served from the media host */}
              <img src={ad.poster} width={1280} height={720} alt="" loading="lazy" decoding="async" className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none dark:brightness-[0.92]" />
              <span aria-hidden className="absolute inset-0 grid place-items-center">
                <span className={`${PLAY_BTN} sm:h-16 sm:w-16`}>
                  <Play className="ml-0.5 h-6 w-6 fill-current sm:h-7 sm:w-7" />
                </span>
              </span>
              <span aria-hidden className="absolute bottom-2 left-2 bg-black/80 px-2 py-1 font-mono text-[12px] text-white">
                {fmtClock(ad.duration)} · sound on
              </span>
            </button>
            {/* 9:16 thumbnail (phones) */}
            <button
              type="button"
              onClick={open}
              aria-label={`Play the video: ${ad.title} (${fmtClock(AD_VERTICAL_SECONDS)}, with sound)`}
              className={`group relative block aspect-[9/16] w-full overflow-hidden border border-line bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:hidden ${radius}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the ad's own 9:16 poster */}
              <img src={tall ? ad.posterVertical! : ad.poster} width={720} height={1280} alt="" loading="lazy" decoding="async" className="block h-full w-full object-cover dark:brightness-[0.92]" />
              <span aria-hidden className="absolute inset-0 grid place-items-center">
                <span className={PLAY_BTN}>
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
              </span>
              <span aria-hidden className="absolute bottom-1.5 left-1.5 bg-black/80 px-1.5 py-0.5 font-mono text-[11px] text-white">
                {fmtClock(tall ? AD_VERTICAL_SECONDS : ad.duration)}
              </span>
            </button>
          </>
        ) : (
          <div className={`border border-line-strong bg-black ${radius} overflow-hidden`}>
            <GuidePlayer
              key={mode}
              video={mode === "tall" && vertical ? vertical : ad}
              from={`promo-${course}`}
              autoPlay
              autoFocus
              className={mode === "tall" ? "!aspect-[9/16]" : ""}
            />
          </div>
        )}
      </div>
    </section>
  );
}
