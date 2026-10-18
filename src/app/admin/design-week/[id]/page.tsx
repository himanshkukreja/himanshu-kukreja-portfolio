import ChallengeAdmin from "@/components/admin/design-week/ChallengeAdmin";

export default async function AdminDesignWeekChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeAdmin id={id} />;
}
