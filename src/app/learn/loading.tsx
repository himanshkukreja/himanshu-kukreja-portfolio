import RouteLoading from "@/components/ui/loader/RouteLoading";

// the root loading screen with the course's terminal home (~/sdm) for course pages without their own
export default function Loading() {
  return <RouteLoading prompt="~/sdm" cmd="cd ~/next-page" steps={["resolve route", "stream page"]} />;
}
