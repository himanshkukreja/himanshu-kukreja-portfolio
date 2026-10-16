import CaseFileEditor from "@/components/admin/case-files/Editor";

export default async function AdminCaseFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseFileEditor id={id} />;
}
