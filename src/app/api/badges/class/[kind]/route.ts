import { NextResponse } from "next/server";
import { ob2BadgeClass } from "@/lib/certificates/badges";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Ctx = { params: Promise<{ kind: string }> };

/** Open Badges 2.0 BadgeClass: `course` or `world-NN`. */
export async function GET(_req: Request, { params }: Ctx) {
  const { kind } = await params;
  if (kind === "course") return NextResponse.json(ob2BadgeClass("course"), { headers: { "access-control-allow-origin": "*" } });
  const m = /^world-(\d{2})$/.exec(kind);
  if (!m) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  const w = map?.weeks.find((x) => x.code === m[1]);
  if (map && !w) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(ob2BadgeClass(kind, w?.title ?? null), { headers: { "access-control-allow-origin": "*" } });
}
