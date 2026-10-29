import { BookOpen, Building2, Clapperboard, Compass, Dumbbell, FileText, FlaskConical, Flame, FolderOpen, Hash, HelpCircle, Lightbulb, MessagesSquare, PlayCircle, Smartphone, Target, Boxes, type LucideIcon } from "lucide-react";
import type { Kind } from "@/lib/search/smart/types";

const ICONS: Record<Kind, LucideIcon> = {
  lesson: BookOpen,
  section: Hash,
  lecture: Clapperboard,
  moment: PlayCircle,
  short: Smartphone,
  quest: Compass,
  problem: Target,
  lld: Boxes,
  case: FolderOpen,
  mock: MessagesSquare,
  war: Flame,
  concept: Lightbulb,
  faq: HelpCircle,
  lab: FlaskConical,
  drill: Dumbbell,
  sheet: FileText,
  company: Building2,
};

export default function KindIcon({ kind, className = "h-4 w-4" }: { kind: Kind; className?: string }) {
  const I = ICONS[kind];
  return <I className={className} aria-hidden />;
}
