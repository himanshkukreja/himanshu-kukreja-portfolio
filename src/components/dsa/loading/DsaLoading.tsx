import RouteLoading, { type RouteShape } from "@/components/ui/loader/RouteLoading";
import { DsaMark } from "@/components/dsa/DsaMark";

/**
 * DSA Mastery's route loading screen (src/app/learn/dsa/**\/loading.tsx): the course's boot log at DSA's own terminal
 * home (~/dsa) with the index mark in its title bar, in teal (.dsa-theme here, data-course on <html> for the rest of
 * the page), over a skeleton shaped like the page that is coming.
 */
export default function DsaLoading({ cmd, steps, shape, label }: { cmd: string; steps: string[]; shape: RouteShape; label?: string }) {
  return (
    <div className="dsa-theme">
      <RouteLoading prompt="~/dsa" mark={<DsaMark className="h-3.5 w-3.5" />} cmd={cmd} steps={steps} shape={shape} label={label} />
    </div>
  );
}
