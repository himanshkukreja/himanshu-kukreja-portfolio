import type { Metadata } from "next";
import PrivacyPage from "@/app/privacy/page";

// systemdesignmastery.dev/privacy: the same policy as himanshukukreja.in/privacy, in the course's
// chrome and canonical on the course host.
export const metadata: Metadata = {
  title: "Privacy & analytics · System Design Mastery",
  description: "What the course records about visits and learning, which analytics tools run, session replay masking, and how to opt out.",
  alternates: { canonical: "/privacy" },
};

export default PrivacyPage;
