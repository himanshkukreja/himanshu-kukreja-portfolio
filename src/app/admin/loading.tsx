import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="admin" bare label="Loading admin" cmd="sudo top" steps={["verify sudo", "query supabase", "draw the panels"]} />;
}
