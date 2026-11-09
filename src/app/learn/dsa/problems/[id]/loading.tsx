import DsaLoading from "@/components/dsa/loading/DsaLoading";

export default function Loading() {
  return <DsaLoading cmd="open problem" steps={["fetch the statement", "warm up the editor"]} shape="split" label="Loading the problem" />;
}
