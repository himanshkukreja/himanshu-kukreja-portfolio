import LearnerDetailPage from "@/components/admin/learners/LearnerDetailPage";

export default async function AdminLearner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LearnerDetailPage id={id} />;
}
