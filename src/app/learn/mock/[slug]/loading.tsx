import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="page" label="Setting up the interview room" cmd="./interview --join" steps={["brief the interviewer", "start the clock", "open the whiteboard"]} />;
}
