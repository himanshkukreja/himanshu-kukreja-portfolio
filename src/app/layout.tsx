import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import Navbar from "@/components/Navbar";
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

export const metadata: Metadata = {
  title: "Himanshu Kukreja — Portfolio",
  description:
    "Software engineer with expertise in backend systems, cloud architecture, real-time streaming, AI integrations, and startup product development.",
  metadataBase: new URL("https://himanshukukreja.in"),
  openGraph: {
    title: "Himanshu Kukreja — Portfolio",
    description:
      "Backend, Cloud, Realtime streaming, AI integrations, Startup product development.",
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
      "Backend, Cloud, Realtime streaming, AI integrations, Startup product development.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AnalyticsTracker />
        <AuthProvider>
          <AuthModalProvider>
            <ThemeProvider>
              <AuthHashHandler />
              <Navbar />
              {children}
              <GlobalAuthModal />
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
