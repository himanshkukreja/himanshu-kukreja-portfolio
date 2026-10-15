import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="story" label="Opening the case file" cmd="cat case-file.md" steps={["pull the incident log", "rebuild the timeline"]} />;
}
