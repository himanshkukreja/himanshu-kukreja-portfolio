import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading prompt="~/sdm" shape="lesson" label="Loading the lesson" cmd="cat lesson.md | render" steps={["fetch lesson.md", "split into stages", "render diagrams + code"]} />;
}
