import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="grid" label="Loading the case files" cmd="ls ./case-files" steps={["open the archive", "count readers", "sort by severity"]} />;
}
