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
// the reader picks light (the site's theme ignores the OS setting).
export const viewport: Viewport = {
  themeColor: "#000000",
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
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* build that rendered this page: a saved copy keeps that build's app files */}
        <meta name="hk-build" content={process.env.NEXT_PUBLIC_HK_BUILD || "dev"} />
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
