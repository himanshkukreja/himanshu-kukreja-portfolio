import Hero from "@/components/Hero";
import { Section } from "@/components/Sections";
import About from "@/components/About";
import Experience from "@/components/Experience";
import Projects from "@/components/Projects";
import Skills from "@/components/Skills";
import Achievements from "@/components/Achievements";
import Contact from "@/components/Contact";
import StoriesGrid from "@/components/StoriesGrid";
import { getAllStories } from "@/lib/stories";
import SmartScroll from "@/components/SmartScroll";
import NewsletterForm from "@/components/NewsletterForm";

export const runtime = "nodejs"; // required for fs access on Vercel

export default async function Home() {
  const stories = await getAllStories();
  return (
    <main className="pt-2 sm:pt-6">
      {/* Smart section snap scrolling (configurable) */}
      <SmartScroll config={{ enabled: true, durationMs: 600, earlySnapThreshold: 0.8 }} />
      <Hero />
      {/* Spacer to prevent About section from peeking into Hero */}
      <div aria-hidden className="h-6 sm:h-10" />
      <Section id="about" title="About Me">
        <About />
      </Section>
      <Section id="experience" title="Experience">
        <Experience />
      </Section>
      <Section id="stories" title="Engineering Stories" description="Deep-dives into backend design, realtime, cloud, and systems—presented as blueprint-style stories.">
        <StoriesGrid initial={stories} limit={2} showExplore exploreHref="/stories" exploreLabel="Explore more stories" />
      </Section>
      <Section id="projects" title="Projects">
        <Projects />
      </Section>
      <Section id="skills" title="Skills">
        <Skills />
      </Section>
      <Section id="achievements" title="Achievements & Certifications">
        <Achievements />
      </Section>
      <Section id="contact" title="Contact">
        <Contact />
      </Section>
      <footer className="py-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="mb-6 flex flex-col items-center gap-3">
            <h3 className="text-white text-lg font-semibold">Subscribe to the newsletter</h3>
            <p className="text-white/70 text-sm">Get the latest engineering stories in your inbox.</p>
            <NewsletterForm />
          </div>
          <div className="text-white/60 text-sm">© {new Date().getFullYear()} Himanshu Kukreja. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
