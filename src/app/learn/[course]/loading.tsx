import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="course" label="Loading the course map" cmd="ls ./worlds --map" steps={["read course index", "count lessons + bosses", "draw the world map"]} />;
}
