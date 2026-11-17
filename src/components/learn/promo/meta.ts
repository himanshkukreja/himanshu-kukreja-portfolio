import type { Metadata } from "next";
import { promoVideo } from "@/lib/learn/guide/videos";

/** Title, description, canonical and share card of the AI tutor pages (the demo's poster is the image). */
export function aiTutorMetadata(course: "sdm" | "dsa"): Metadata {
  const dsa = course === "dsa";
  const path = dsa ? "/dsa/ai-tutor" : "/ai-tutor";
  const title = `AI tutor: how it works · ${dsa ? "DSA Mastery" : "System Design Mastery"}`;
  const description = "An 8-minute demo of the course's AI tutor: a plan from your progress, answers from the lesson with sources, hints that never spoil, and memory between sessions. Try it free.";
  const poster = promoVideo("ai-demo")?.poster;
  const images = poster ? [{ url: poster.split("?")[0], width: 1280, height: 720, alt: "How our AI works" }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images: images?.map((i) => i.url) },
  };
}
