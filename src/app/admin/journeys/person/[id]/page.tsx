import PersonTimeline from "@/components/admin/journeys/PersonTimeline";

/** /admin/journeys/person/<PostHog person uuid | distinct id> — one person's timeline + replays. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonTimeline id={decodeURIComponent(id)} />;
}
