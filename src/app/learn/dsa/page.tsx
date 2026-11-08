import type { Metadata } from "next";
import DsaComingSoon from "@/components/dsa/soon/DsaComingSoon";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";

// DSA Mastery (systemdesignmastery.dev/dsa): until launch, production shows only this coming-soon page with the
// waitlist and the founding-member offer (plan §15.3). No data on the server: the waitlist card loads per-visitor
// state on the client, so the page is prerendered at build and served from the cache. Indexable, to start ranking early.

const TITLE = "DSA Mastery: coming soon · System Design Mastery";
const SHARE_TITLE = "DSA Mastery: data structures and algorithms through real product engineering";
const DESCRIPTION =
  "A concept-first DSA course from System Design Mastery: the 6S teaching loop, six worlds on a game map, an AI tutor, plans and curated sheets, and a problem platform in Python, Java, C++ and JavaScript. Join the waitlist: founding members keep both courses free for life.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/dsa" },
  openGraph: { title: SHARE_TITLE, description: DESCRIPTION, url: "/dsa", type: "website" },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: DESCRIPTION },
};

export default function DsaPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbs([
          { name: "System Design Mastery", path: "/" },
          { name: "DSA Mastery", path: "/dsa" },
        ])}
      />
      <DsaComingSoon />
    </>
  );
}
