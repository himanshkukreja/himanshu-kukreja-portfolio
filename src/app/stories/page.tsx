import { Section } from "@/components/Sections";
import StoriesGrid from "@/components/StoriesGrid";
import { getAllStories } from "@/lib/stories";
import NewsletterForm from "@/components/NewsletterForm";

export const runtime = "nodejs"; // required for fs access on Vercel
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StoriesPage() {
  const stories = await getAllStories();
  return (
    <main className="pt-6">
      <Section id="stories" title="Engineering Stories">
        <StoriesGrid initial={stories} />
        <div className="mt-10 flex flex-col items-center gap-3">
          <h3 className="text-gray-900 dark:text-white text-lg font-semibold">Subscribe to the Stories</h3>
          <p className="text-gray-600 dark:text-white/70 text-sm">Get the latest stories in your inbox.</p>
          <NewsletterForm />
        </div>
      </Section>
    </main>
  );
}
