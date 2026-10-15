import CampaignPage from "@/components/admin/newsletter/CampaignPage";

export default async function AdminCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignPage key={id} id={id} />;
}
