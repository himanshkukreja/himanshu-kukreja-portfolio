"use client";
import { motion, cubicBezier } from "framer-motion";
import { Award, BadgeCheck, Trophy } from "lucide-react";

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
    transition: { duration: 0.45, ease: cubicBezier(0.22, 1, 0.36, 1) },
  },
};

export default function Achievements() {
  const items = [
    { icon: Trophy, text: "Product Hunt Product of the Day for AutoFlow." },
    { icon: Award, text: "Hackathon awards, Inspire Award, Punjab State Matriculation Top 10." },
    { icon: BadgeCheck, text: "Coursera: Databases with Python, Web Applications with Django." },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
      className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {items.map((i) => (
        <motion.article
          key={i.text}
          variants={item}
          className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)]"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
              <i.icon className="h-5 w-5" />
            </span>
            <p className="text-sm text-white/85">{i.text}</p>
          </div>
          <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
        </motion.article>
      ))}
    </motion.div>
  );
}
