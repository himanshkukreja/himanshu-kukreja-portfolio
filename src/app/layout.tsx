import type { Metadata, Viewport } from "next";
import { EMAIL, SOCIALS } from "@/lib/socials";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import SiteHeader from "@/components/site/SiteHeader";
import { GameProvider } from "@/game/GameProvider";
import XPToaster from "@/game/XPToaster";
import Terminal from "@/game/Terminal";
import { Analytics } from '@vercel/analytics/next';
import AnalyticsTracker from "@/components/AnalyticsTracker";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import GlobalAuthModal from "@/components/GlobalAuthModal";
import AuthHashHandler from "@/components/AuthHashHandler";
import RouteProgress from "@/components/site/RouteProgress";
import OfflineProvider from "@/components/offline/OfflineProvider";



const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Himanshu Kukreja",
  url: "https://himanshukukreja.in",
  jobTitle: "Senior Software Engineer",
  worksFor: { "@type": "Organization", name: "Senseloaf AI", url: "https://senseloaf.ai" },
  email: `mailto:${EMAIL}`,
  sameAs: SOCIALS.map((s) => s.href),
};

export const metadata: Metadata = {
  title: "Himanshu Kukreja — Portfolio",
  description:
    "Senior software engineer leading engineering at Senseloaf AI. Ships product end to end, streams real devices to browsers, open-sources the tools, writes case files and teaches system design.",
  // Apex 307-redirects to www, so absolute OG/Twitter image URLs point straight at www.
  metadataBase: new URL("https://www.himanshukukreja.in"),
  alternates: { types: { "application/rss+xml": [{ url: "/stories/feed.xml", title: "Case files · Himanshu Kukreja" }] } },
  // No title/description/images here on purpose: og:title/description fall back to each page's own
  // title/description, and the card images come from the opengraph-image / twitter-image routes
  // (src/app, src/app/learn, src/app/learn/[course]/[week]/[slug]); /stories/[slug] sets its cover.
  openGraph: {
    type: "website",
    siteName: "Himanshu Kukreja",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@hi_kukreja",
  },
};

// Browser chrome colour: the default (dark) theme's black; the offline provider re-points it when
// the reader picks light (the site's theme ignores the OS setting). viewport-fit=cover lets the
// installed iPhone app draw under the status bar and the home indicator: the header, docks and
// toolbars pad themselves with the safe-area insets (globals.css "Installed app window").
export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      {/* Icons in <head> on every page. Pages with an async generateMetadata behind a loading.tsx
          (lessons, side quests) get their metadata streamed into <body>, where browsers ignore
          favicons, so the file-convention <link>s alone left those tabs without an icon. */}
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        {/* Offline reading / installable app (src/app/manifest.ts, public/sw.js); in <head> for the same reason. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="SD Mastery" />
        {/* white status text over the page (the header pads under it): the dark default theme
            continues behind it, the light theme gets a black strip there (globals.css) */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* build that rendered this page: a saved copy keeps that build's app files */}
        <meta name="hk-build" content={process.env.NEXT_PUBLIC_HK_BUILD || "dev"} />
        {/* iPhone home-screen app (iOS 26): the layout viewport can come up shorter than the screen while the page
            still draws from the very top, so fixed bottom bars stop short and leave a black band. Measure that gap
            (real screen height minus the reported one) into --hk-app-gap; bottom-pinned layers extend by it
            (globals.css "Installed app window"). 0 everywhere else, and once iOS reports the full height. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(navigator.standalone!==true||!/iPhone/.test(navigator.userAgent))return;var r=document.documentElement;function f(){var land=window.innerWidth>window.innerHeight;var full=land?Math.min(screen.width,screen.height):Math.max(screen.width,screen.height);var g=Math.round(full-window.innerHeight);r.style.setProperty("--hk-app-gap",(g>0&&g<200?g:0)+"px")}f();window.addEventListener("resize",f);window.addEventListener("orientationchange",function(){setTimeout(f,300)})}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased pb-24 lg:pb-0`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_LD) }} />
        <RouteProgress />
        <AnalyticsTracker />
        <AnalyticsProvider />
        <AuthProvider>
          <AuthModalProvider>
            <ThemeProvider>
              <GameProvider>
                <OfflineProvider>
                  <AuthHashHandler />
                  <SiteHeader />
                  {children}
                  <XPToaster />
                  <Terminal />
                  <GlobalAuthModal />
                </OfflineProvider>
              </GameProvider>
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
