import { notFound } from "next/navigation";
import { getStoryBySlug } from "@/lib/stories";
import Link from "next/link";
import Image from "next/image";
import SafeImage from "@/components/SafeImage";

export const runtime = "nodejs"; // required for fs access on Vercel

export async function generateStaticParams() {
  const { getAllStories } = await import("@/lib/stories");
  const list = await getAllStories();
  return list.map((s) => ({ slug: s.slug }));
}

export default async function StoryReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) return notFound();

  return (
    <main className="pt-6">
      <article className="max-w-3xl mx-auto px-6">
        <header className="mb-10">
          <Link href="/stories" className="text-white/70 hover:text-white">← Back to stories</Link>
          {/* Title first */}
          <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white">{story.title}</h1>
          {story.date && <p className="mt-1 text-sm text-white/60">{new Date(story.date).toLocaleDateString()}</p>}
          {/* Cover image after the main title */}
          {story.cover && (
            <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <SafeImage
                src={story.cover}
                alt={story.title}
                width={1200}
                height={630}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          )}
        </header>
        <div className="md-content">
          <div dangerouslySetInnerHTML={{ __html: story.content }} />
        </div>
      </article>
    </main>
  );
}
