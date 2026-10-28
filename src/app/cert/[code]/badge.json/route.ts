import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/certificates/core";
import { publicAssertion } from "@/lib/certificates/service";

export const runtime = "nodejs";
// cached like the verification page; every status change revalidates /cert/<code> (layout)
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Ctx = { params: Promise<{ code: string }> };

/** Open Badges 2.0 hosted assertion (public certificates only; the middleware 404s the rest). */
export async function GET(_req: Request, { params }: Ctx) {
  const code = normalizeCode((await params).code);
  const a = code ? await publicAssertion(code) : null;
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(a, { headers: { "access-control-allow-origin": "*", "content-type": "application/ld+json; charset=utf-8" } });
}
