import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FullPageEditor from "@/components/learn/ink/FullPageEditor";

export const metadata: Metadata = {
  title: "Notebook page · Learn · Himanshu Kukreja",
  robots: { index: false, follow: false },
};

// the same shell for everyone: the page loads on the client with the learner's session (cached per id, no data)
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export default async function NotebookPageRoute({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <FullPageEditor pageId={id.toLowerCase()} />;
}
