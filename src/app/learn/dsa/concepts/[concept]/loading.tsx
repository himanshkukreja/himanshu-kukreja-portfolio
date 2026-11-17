import DsaLoading from "@/components/dsa/loading/DsaLoading";

export default function Loading() {
  return <DsaLoading cmd="open lesson" steps={["fetch the lesson", "lay out the six steps"]} shape="lesson" label="Loading the lesson" />;
}
