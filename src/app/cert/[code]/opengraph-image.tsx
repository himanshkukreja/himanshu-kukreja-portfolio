import { certificateCard } from "@/lib/og/certificate-card";
import { normalizeCode } from "@/lib/certificates/core";
import { publicCertificate } from "@/lib/certificates/service";

export const runtime = "nodejs";
export const alt = "A System Design Mastery certificate of completion";
export const size = { width: 1200, height: 627 };
export const contentType = "image/png";
export const revalidate = 3600;
export const dynamicParams = true;
/** None at build: each image renders on its first request, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Params = { code: string };

/** Unknown / private codes get the neutral card (nothing about anyone leaks). */
export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const code = normalizeCode((await params).code);
  // a database error throws (never cached); unknown or private codes get the neutral card
  const c = code ? await publicCertificate(code) : null;
  return certificateCard(c?.view ?? null);
}
