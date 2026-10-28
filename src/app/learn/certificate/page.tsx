import type { Metadata } from "next";
import OnlineOnly from "@/components/offline/OnlineOnly";
import CertificateFlow from "@/components/learn/certificate/CertificateFlow";

export const metadata: Metadata = {
  title: "Certificate · System Design Mastery",
  description: "Earn the System Design Mastery certificate of completion and one certificate per world: every lesson and capstone interview, every trial part, every interview boss and three mock interviews at Hire or better.",
  alternates: { canonical: "/learn/certificate" },
  robots: { index: false, follow: true },
};

/** Earning certificates is checked on the server, so it needs a connection (never saved offline). */
export default function CertificatePage() {
  return (
    <OnlineOnly what="Earning a certificate" note="Every requirement is checked on the server when you claim. Come back when you're online." className="mx-4 sm:mx-auto sm:max-w-[1100px]">
      <CertificateFlow />
    </OnlineOnly>
  );
}
