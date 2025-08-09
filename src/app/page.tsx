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

export const runtime = "nodejs"; // required for fs access on Vercel

export default async function Home() {
  const stories = await getAllStories();
  return (
    <main className="pt-6">
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
        <div className="max-w-7xl mx-auto px-6 text-center text-white/60 text-sm">
          © {new Date().getFullYear()} Himanshu Kukreja. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
