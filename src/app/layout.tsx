import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased pb-24 lg:pb-0`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_LD) }} />
        <RouteProgress />
        <AnalyticsTracker />
        <AnalyticsProvider />
        <AuthProvider>
          <AuthModalProvider>
            <ThemeProvider>
              <GameProvider>
                <AuthHashHandler />
                <SiteHeader />
                {children}
                <XPToaster />
                <Terminal />
                <GlobalAuthModal />
              </GameProvider>
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
