import type { Metadata } from "next";
import Link from "next/link";
import { EMAIL } from "@/lib/socials";
import { gaEnabled, posthogEnabled } from "@/lib/analytics/config";
import AnalyticsOptOut from "@/components/analytics/AnalyticsOptOut";

export const metadata: Metadata = {
  title: "Privacy & analytics · Himanshu Kukreja",
  description: "What this site records about visits and learning, which analytics tools run, session replay masking, and how to opt out.",
};

const H2 = "font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[28px]";
const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-3 border-t border-line pt-6">
      <span className={LABEL}>{label}</span>
      <h2 id={`${id}-h`} className={H2}>
        {title}
      </h2>
      <div className="flex max-w-[68ch] flex-col gap-3 text-[15px] leading-relaxed text-fg-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  const ph = posthogEnabled();
  const ga = gaEnabled();
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs text-fg-3">
          <span className="text-signal-text">$</span> cat ~/privacy.md
        </span>
        <h1 className="font-display text-[40px] font-extrabold leading-[1.02] tracking-tightest text-fg sm:text-[56px]">
          Privacy &amp; analytics<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[62ch] text-[16px] leading-relaxed text-fg-2">
          This is a personal site and a free system-design course. I measure how it is used so I can make the lessons better. No ads, no selling
          or sharing data with advertisers, and you can switch analytics off below.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <AnalyticsOptOut />
        <p className="font-mono text-[11px] leading-relaxed text-fg-4">
          Stored in this browser only. Global Privacy Control is honoured automatically. Do Not Track is not: it is a retired browser setting with no agreed meaning, so use the switch above instead.
        </p>
      </div>

      <Section id="what" label="01 · what is recorded" title="Visits and learning activity">
        <ul>
          <li>
            <strong>Page views and reading time</strong>: the page, referrer and campaign tags, device type, browser, screen size, approximate
            country/city (from the request, the IP address itself is not stored), time actively reading and how far you scrolled.
          </li>
          <li>
            <strong>Learning events</strong>: lessons opened and completed, sections read, quiz and trial answers, searches (length only, never the
            text), shares, &quot;Ask AI&quot; clicks, games played.
          </li>
          <li>
            <strong>Offline reading</strong>: what you save for offline reading (which article or world, and its size), opening saved copies and
            installing the app. Events from while you&apos;re offline, like stages cleared, wait on your device and are sent when you&apos;re back
            online.
          </li>
          <li>
            <strong>If you sign in</strong>: your email, name and avatar from the sign-in provider, plus your progress, streaks, notes, bookmarks
            and comments, so they follow you across devices.
          </li>
          <li>
            <strong>Profile photo</strong>: if you upload one, it&apos;s cropped to a small square on your device (location and camera details
            are removed), stored, and shown publicly next to your comments and on your profile. Remove it any time from the avatar picker; the
            file is deleted.
          </li>
        </ul>
      </Section>

      <Section id="tools" label="02 · tools" title="Which analytics tools run">
        <ul>
          <li>
            <strong>First-party analytics</strong> (always): sent to this site&apos;s own API and stored in its database (Supabase).
          </li>
          <li>
            <strong>PostHog</strong> {ph ? "(active)" : "(not enabled yet)"}: product analytics, heatmaps and <strong>session replay</strong>. Requests
            go through this site&apos;s own domain. Signed-in visitors are linked to their account ID and email so I can follow a learner&apos;s
            journey and help when something breaks.
          </li>
          <li>
            <strong>Google Analytics 4</strong> {ga ? "(active)" : "(not enabled yet)"}: aggregate traffic reports. Advertising features, ad
            personalisation and ad storage are switched off (Consent Mode: ad_storage denied).
          </li>
          <li>
            <strong>Vercel Web Analytics</strong>: cookie-free page counts from the hosting provider.
          </li>
        </ul>
      </Section>

      <Section id="replay" label="03 · session replay" title="What a session recording shows">
        <p>
          A replay is a reconstruction of the page (not a video of your screen): clicks, scrolling and page changes. <strong>Everything you
          type is masked</strong>: email and code fields, notes, comment drafts and every other input appear as asterisks. Pages under /admin are
          never recorded. Recordings are kept for about a month, then deleted by PostHog.
        </p>
      </Section>

      <Section id="choices" label="04 · your choices" title="Opting out and deleting data">
        <ul>
          <li>Use the switch at the top of this page (or &quot;opt out&quot; in the footer). It stops all three analytics tools in this browser.</li>
          <li>Turn on Global Privacy Control in your browser (built into Brave and Firefox, or an extension elsewhere): the site then sends nothing to PostHog or Google. The older Do Not Track setting doesn&apos;t switch analytics off; use the switch above.</li>
          <li>
            Reset your learning progress any time from <Link href="/learn/dashboard" className="text-fg underline underline-offset-4">your progress page</Link>.
          </li>
          <li>
            To delete your account and its data, or to ask what is stored about you, email{" "}
            <a href={`mailto:${EMAIL}?subject=Privacy%20request`} className="text-fg underline underline-offset-4">
              {EMAIL}
            </a>
            .
          </li>
        </ul>
      </Section>

      <p className="border-t border-line pt-6 font-mono text-[11px] text-fg-4">last updated · October 2026</p>
    </main>
  );
}
