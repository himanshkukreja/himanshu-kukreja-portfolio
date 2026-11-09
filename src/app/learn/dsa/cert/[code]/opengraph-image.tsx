import { dsaCertCard } from "@/lib/og/dsa-cert-card";
import { isDsaCode } from "@/lib/dsa/cert/rules";
import { publicDsaCert } from "@/lib/dsa/cert/service";
import { DSA_FULL } from "@/lib/dsa/flags";

export const runtime = "nodejs";
export const alt = "A DSA Mastery · Foundations certificate of completion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = { code: string };

/** Unknown or private codes get the neutral card (nothing about anyone leaks). */
export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const c = DSA_FULL && isDsaCode(code) ? await publicDsaCert(code) : null;
  return dsaCertCard(c);
}
