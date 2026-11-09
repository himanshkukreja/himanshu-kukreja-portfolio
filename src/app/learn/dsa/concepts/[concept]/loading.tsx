import DsaLoading from "@/components/dsa/loading/DsaLoading";

export default function Loading() {
  return <DsaLoading cmd="open concept" steps={["fetch the lesson", "lay out the six beats"]} shape="lesson" label="Loading the concept" />;
}
