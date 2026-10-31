"use client";

/**
 * The guide's video block: the welcome trailer as a large inline player, a link to the full tour,
 * then "Watch how each feature works": one card per published feature video, each opening the
 * shared player. Nothing but the card images loads until play (preload="none", lazy images).
 */
import { Play } from "lucide-react";
import { FEATURE_VIDEOS, SERIES_SIZE, fmtClock, guideVideo, openGuideVideo, type GuideVideo } from "@/lib/learn/guide/videos";
import GuidePlayer from "./GuidePlayer";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";
const H2 = "m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.035em] text-fg sm:text-[40px]";

export default function GuideVideos() {
  const trailer = guideVideo("welcome-trailer");
  const tour = guideVideo("full-tour");
  if (!trailer && !tour && !FEATURE_VIDEOS.length) return null;
  const tourLink = tour && (
    <button
      type="button"
      onClick={() => openGuideVideo(tour.id, "guide")}
      className="inline-flex min-h-11 items-center gap-2 self-start border border-line-strong px-4 text-[14px] font-semibold text-fg hover:bg-surface-2"
    >
      <Play className="h-3.5 w-3.5 fill-current text-signal-text" aria-hidden />
      Watch the full tour · {fmtClock(tour.duration)}
    </button>
  );

  return (
    <section id="videos" aria-label="Videos" className="flex scroll-mt-[calc(var(--hk-header-h,61px)+72px)] flex-col gap-12 lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]">
      {trailer ? (
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-10">
          <div className="border border-line-strong bg-black">
            <GuidePlayer video={trailer} from="guide" />
          </div>
          <div className="flex flex-col gap-3">
            <span className={LABEL}>
              <span className="text-signal-text">start here</span> · {fmtClock(trailer.duration)} with sound
            </span>
            <h2 className={H2}>
              {trailer.title}
              <span className="text-signal-text">.</span>
            </h2>
            <p className="m-0 text-[16px] leading-relaxed text-fg-2">{trailer.summary}</p>
            {tourLink}
          </div>
        </div>
      ) : (
        tourLink
      )}

      {FEATURE_VIDEOS.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className={LABEL}>
              the feature videos · {FEATURE_VIDEOS.length === SERIES_SIZE ? SERIES_SIZE : `${FEATURE_VIDEOS.length} of ${SERIES_SIZE}`}, 2–3 minutes each
            </span>
            <h2 id="feature-videos-h" className={H2}>
              Watch how each feature works<span className="text-signal-text">.</span>
            </h2>
          </div>
          <ul aria-labelledby="feature-videos-h" className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {FEATURE_VIDEOS.map((v) => (
              <li key={v.id} className="flex">
                <Card v={v} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Card({ v }: { v: GuideVideo }) {
  const nn = String(v.n).padStart(2, "0");
  return (
    <button
      type="button"
      onClick={() => openGuideVideo(v.id, "guide")}
      aria-label={`Play ${nn}, ${v.title} (${fmtClock(v.duration)})`}
      className="group flex w-full flex-col border border-line bg-surface text-left hover:border-fg-4"
    >
      <span className="relative block aspect-video w-full overflow-hidden border-b border-line bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- the video's own poster, served from the media host */}
        <img
          src={v.thumb}
          srcSet={v.thumb === v.poster ? undefined : `${v.thumb} 640w, ${v.poster} 1280w`}
          sizes="(min-width: 1536px) 300px, (min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
          width={640}
          height={360}
          alt=""
          loading="lazy"
          decoding="async"
          className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none dark:brightness-[0.9]"
        />
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center bg-signal text-on-signal opacity-90 shadow-[0_6px_24px_rgba(0,0,0,0.3)] group-hover:opacity-100">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>
        <span className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 font-mono text-[12px] text-white">{fmtClock(v.duration)}</span>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="font-mono text-[12px] font-semibold text-signal-text">{nn}</span>
        <span className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-fg">{v.title}</span>
        <span className="text-[14px] leading-snug text-fg-2">{v.summary}</span>
      </span>
    </button>
  );
}
