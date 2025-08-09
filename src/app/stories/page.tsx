import { Section } from "@/components/Sections";
import StoriesGrid from "@/components/StoriesGrid";
import { getAllStories } from "@/lib/stories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StoriesPage() {
  const stories = await getAllStories();
  return (
    <main className="pt-6">
      <Section id="stories" title="Engineering Stories">
        <StoriesGrid initial={stories} />
      </Section>
    </main>
  );
}
