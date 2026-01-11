"use client";
import { motion, cubicBezier } from "framer-motion";
import { Database, Server, Cloud, Code, Cpu, Sparkles } from "lucide-react";

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

const categories = [
  {
    title: "Backend",
    icon: Server,
    items: ["Python (FastAPI, Flask, Django)", "Golang", "Node.js", "C++"],
  },
  { title: "Frontend", icon: Code, items: ["React", "JavaScript", "HTML/CSS"] },
  {
    title: "Cloud/DevOps",
    icon: Cloud,
    items: [
      "AWS (ECS, Lambda, CloudFront, S3, EFS)",
      "GCP (Cloud Run, Storage)",
      "Docker, CI/CD, Nginx, Terraform, Ansible",
    ],
  },
  { title: "Databases", icon: Database, items: ["PostgreSQL", "MySQL", "MongoDB", "Redis"] },
  { title: "Other", icon: Cpu, items: ["WebRTC", "WebSockets", "noVNC", "AI agent integrations"] },
  { title: "Soft Skills", icon: Sparkles, items: ["Leadership & Mentorship", "Product thinking", "Communication", "Ownership"] },
];

export default function Skills() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
      className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {categories.map((c) => (
        <motion.div
          key={c.title}
          variants={item}
          className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)]"
        >
          <div className="flex items-center gap-2 text-white">
            <c.icon className="h-5 w-5 text-indigo-300/90" />
            <h3 className="font-semibold text-base sm:text-lg">{c.title}</h3>
          </div>
          <ul className="mt-3 space-y-2 text-white/85">
            {c.items.map((it) => (
              <li key={it} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500" />
                <span className="text-sm">{it}</span>
              </li>
            ))}
          </ul>
          <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
        </motion.div>
      ))}
    </motion.div>
  );
}
