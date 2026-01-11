"use client";
import { motion, cubicBezier } from "framer-motion";
import { ExternalLink, FolderGit2 } from "lucide-react";

type Project = { title: string; desc: string; tags: string[]; link?: string };

const container = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.14, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: cubicBezier(0.4, 0, 0.2, 1) },
  },
};

const tagClass =
  "inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500/15 to-blue-500/15 px-2 py-0.5 text-[10px] text-gray-700 dark:text-white/85 ring-1 ring-inset ring-white/10 transition-colors hover:from-indigo-500/25 hover:to-blue-500/25";

export default function Projects() {
  const projects: Project[] = [
    { title: "LogIngestor", desc: "Scalable log ingestion with FastAPI, RabbitMQ, MongoDB, Elasticsearch.", tags: ["FastAPI","RabbitMQ","MongoDB","Elasticsearch"] },
    { title: "AI Powered Smart Glasses", desc: "Assistive tech with face recognition, image captioning, and object detection.", tags: ["CV","AI","Edge"] },
    { title: "SmartAgri Solutions", desc: "Crop/fertilizer recommendations and plant disease detection with AI.", tags: ["AI","AgriTech"] },
    { title: "Cloud Playwright Runner", desc: "AutoFlow’s scalable Playwright backend.", tags: ["Playwright","Workers","K8s/AWS"] },
    { title: "iOS Bridge", desc: "Open-source CLI for streaming and controlling iOS simulators remotely.", tags: ["WebRTC","WebSocket","CLI"], link: "https://github.com/" },
    { title: "Cloud Slicer Service", desc: "Serverless 3D slicer deployment with state persistence and web streaming.", tags: ["GCP","AWS","Docker"] },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
      className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {projects.map((p) => (
        <motion.article
          key={p.title}
          variants={item}
          className="group relative rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-6 text-gray-800 dark:text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)] will-change-transform"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <FolderGit2 className="h-5 w-5 text-indigo-300/90" />
              <h3 className="font-semibold text-base sm:text-lg">{p.title}</h3>
            </div>
            {p.link && (
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-2.5 py-1 text-xs text-gray-700 dark:text-white/80 hover:bg-black/10 dark:bg-white/10"
              >
                View <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <p className="text-gray-700 dark:text-white/80 mt-2 text-sm">{p.desc}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <span key={t} className={tagClass}>
                {t}
              </span>
            ))}
          </div>

          <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
        </motion.article>
      ))}
    </motion.div>
  );
}
