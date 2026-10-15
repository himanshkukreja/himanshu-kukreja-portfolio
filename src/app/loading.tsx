import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading cmd="cd ~/next-page" steps={["resolve route", "stream page"]} />;
}
