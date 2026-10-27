import { notFound } from "next/navigation";
import { getShort, lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import ShortRecord from "@/components/learn/lecture/ShortRecord";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

/** A short's own address: the exporter records it here (?record=1); anyone else lands in the shorts feed at it. */
export default async function ShortPage({ params }: Props) {
  const { id } = await params;
  const l = await getShort(id);
  if (!l) notFound();
  return <ShortRecord lecture={l} source={lectureHash(l)} mediaBase={lectureMediaBase()} />;
}
