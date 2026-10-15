import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="page" label="Loading your notebook" cmd="open ~/notebook" steps={["load notes", "load bookmarks", "sort by lesson"]} />;
}
