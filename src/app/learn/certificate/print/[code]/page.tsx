import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CERT_TITLE, ISSUER, normalizeCode } from "@/lib/certificates/core";
import OwnCertificatePrint from "@/components/learn/certificate/OwnCertificatePrint";

export const metadata: Metadata = {
  title: `${CERT_TITLE} · ${ISSUER}`,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

// the same shell for everyone (the certificate loads on the client): cached per code, like /cert pages
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ code: string }> };

/** The learner's own certificate to print, public page or not (everything loads on the client). */
export default async function OwnCertificatePrintPage({ params }: Props) {
  const code = normalizeCode((await params).code);
  if (!code) notFound();
  return <OwnCertificatePrint code={code} />;
}
