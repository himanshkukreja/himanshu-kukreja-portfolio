import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { gateLesson } from "@/lib/gate/server";
import { JsonLd, plainArticle, signInGated } from "@/lib/seo/jsonld";
import { getStepLabels } from "@/lib/dsa/load";
import { findLean, getLeanIndex, getLeanLecture, getLeanPage } from "@/lib/dsa/kinds-load";
import { getLeanExtras } from "@/lib/dsa/lean-extras";
import { leanHref, leanLectureHref } from "@/lib/dsa/kinds";
import { stepOf } from "@/lib/dsa/steps";
import { lectureCard, lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import LecturePlayer from "@/components/learn/lecture/LecturePlayer";
import LeanReader from "./LeanReader";

/**
 * The pages of the lean lessons (streets, camp tents, sets). One implementation behind three route folders
 * (src/app/learn/dsa/districts|camps|sets/[module]/[lesson]); a route passes its root. Staging only until launch (DSA_FULL).
 */
export type LeanParams = { params: Promise<{ module: string; lesson: string }> };

export async function leanMetadata(root: string, { params }: LeanParams): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { module, lesson } = await params;
  const s = await getLeanPage(root, module, lesson).catch(() => null);
  if (!s) return { title: "Not found" };
  return { title: `${s.title} · DSA Mastery`, description: s.summary, alternates: { canonical: leanHref(s.kind, module, lesson) }, robots: { index: false, follow: false } };
}

export async function LeanLessonRoute(root: string, { params }: LeanParams) {
  if (!DSA_FULL) notFound();
  const { module, lesson } = await params;
  const [s, lecture] = await Promise.all([getLeanPage(root, module, lesson), getLeanLecture(module, lesson).catch(() => null)]);
  if (!s) notFound();
  const card = lectureCard(lecture);
  const gate = gateLesson(s.html, "lean");
  const extras = await getLeanExtras(module, lesson);
  const path = leanHref(s.kind, module, lesson);
  return (
    <div className="dsa-theme">
      <main className="pb-16">
        <JsonLd data={signInGated(plainArticle({ title: s.title, description: s.summary, path }), gate.gated)} />
        <LeanReader page={{ ...s, html: gate.html }} lecture={card ? { ...card, href: leanLectureHref(s.kind, module, lesson) } : null} extras={extras} />
      </main>
    </div>
  );
}

export async function leanLectureMetadata(root: string, { params }: LeanParams): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { module, lesson } = await params;
  const [l, lean] = await Promise.all([getLeanLecture(module, lesson).catch(() => null), findLean(root, module, lesson).catch(() => null)]);
  if (!l || !lean) return { title: "Not found" };
  return { title: `${l.title} · Lecture · DSA Mastery`, description: l.summary, alternates: { canonical: leanLectureHref(lean.kind, module, lesson) }, robots: { index: false, follow: false } };
}

export async function LeanLectureRoute(root: string, { params }: LeanParams) {
  if (!DSA_FULL) notFound();
  const { module, lesson } = await params;
  const [l, lean, labels] = await Promise.all([getLeanLecture(module, lesson), findLean(root, module, lesson), getStepLabels()]);
  if (!l || !lean) notFound();
  // up next: the next written lesson of this group that has a lecture
  const group = (await getLeanIndex()).filter((x) => x.module === module);
  let next: { href: string; title: string; code: string } | null = null;
  for (const x of group.slice(group.findIndex((y) => y.id === lesson) + 1, group.findIndex((y) => y.id === lesson) + 4)) {
    const nl = await getLeanLecture(x.module, x.id).catch(() => null);
    if (nl) {
      next = { href: leanLectureHref(x.kind, x.module, x.id), title: nl.title, code: x.station ? stepOf(labels, x.station).step : "" };
      break;
    }
  }
  const code = lean.station ? stepOf(labels, lean.station).step : "";
  return (
    <div className="dsa-theme">
      <LecturePlayer lecture={l} quest={{ title: lean.title, href: lean.href, code }} source={lectureHash(l)} mediaBase={lectureMediaBase()} next={next} />
    </div>
  );
}
