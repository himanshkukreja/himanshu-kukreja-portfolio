import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading prompt="~/sdm" shape="page" label="Opening the code lab" cmd="./lab --open" steps={["read the brief", "load the starter", "line up the tests"]} />;
}
