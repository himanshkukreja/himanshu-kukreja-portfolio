import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";

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
  metadataBase: new URL("https://example.com"),
  openGraph: {
    title: "Himanshu Kukreja — Portfolio",
    description:
      "Backend, Cloud, Realtime streaming, AI integrations, Startup product development.",
    url: "https://example.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Himanshu Kukreja — Portfolio",
    description:
      "Backend, Cloud, Realtime streaming, AI integrations, Startup product development.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <Navbar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
