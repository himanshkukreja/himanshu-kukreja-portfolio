import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="page" label="Loading your review deck" cmd="review --due today" steps={["load cards", "shuffle the deck"]} />;
}
