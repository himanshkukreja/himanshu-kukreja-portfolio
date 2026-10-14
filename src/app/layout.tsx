import type { Metadata } from "next";
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
import GlobalAuthModal from "@/components/GlobalAuthModal";
import AuthHashHandler from "@/components/AuthHashHandler";



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

export const metadata: Metadata = {
  title: "Himanshu Kukreja — Portfolio",
  description:
    "Senior software engineer leading engineering at Senseloaf AI. Ships product end to end, streams real devices to browsers, open-sources the tools, writes case files and teaches system design.",
  metadataBase: new URL("https://himanshukukreja.in"),
  openGraph: {
    title: "Himanshu Kukreja — Portfolio",
    description:
      "Senior SWE at Senseloaf AI · end-to-end product · realtime streaming · open source · system design.",
    url: "https://himanshukukreja.in",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Himanshu Kukreja - Software Engineer Portfolio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Himanshu Kukreja — Portfolio",
    description:
      "Senior SWE at Senseloaf AI · end-to-end product · realtime streaming · open source · system design.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased pb-24 lg:pb-0`}>
        <AnalyticsTracker />
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
