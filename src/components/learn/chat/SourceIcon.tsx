import { LifeBuoy } from "lucide-react";
import KindIcon from "@/components/learn/search/KindIcon";
import type { ChatSource } from "@/lib/ai/chat/text";

/** A cited resource's icon: the search index kind's, or a life buoy for the site's own help pages. */
export default function SourceIcon({ kind, className = "h-4 w-4" }: { kind: ChatSource["kind"]; className?: string }) {
  if (kind === "guide") return <LifeBuoy className={className} aria-hidden />;
  return <KindIcon kind={kind} className={className} />;
}
