import DsaLoading from "@/components/dsa/loading/DsaLoading";

// DSA Mastery pages without their own: the hub, the problem list, the lecture (src/components/dsa/loading)
export default function Loading() {
  return <DsaLoading cmd="cd ~/dsa" steps={["load your next step", "open the page"]} shape="course" label="Loading DSA Mastery" />;
}
