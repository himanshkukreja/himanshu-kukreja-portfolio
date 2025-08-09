"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Satisfy } from "next/font/google";

const signatureFont = Satisfy({ subsets: ["latin"], weight: "400" });

const sections = [
    { id: "about", label: "About" },
    { id: "experience", label: "Experience" },
    { id: "stories", label: "Stories" },
    { id: "projects", label: "Projects" },
    { id: "skills", label: "Skills" },
    { id: "achievements", label: "Achievements" },
    { id: "contact", label: "Contact" },
];

export default function Navbar() {
    const [active, setActive] = useState<string>("home");
    const { resolvedTheme, setTheme } = useTheme();

    useEffect(() => {
        const handler = () => {
            const offsets = sections.map((s) => {
                const el = document.getElementById(s.id);
                if (!el) return { id: s.id, top: Infinity };
                const rect = el.getBoundingClientRect();
                return { id: s.id, top: Math.abs(rect.top) };
            });
            const sorted = offsets.sort((a, b) => a.top - b.top);
            setActive(sorted[0]?.id ?? "home");
        };
        handler();
        window.addEventListener("scroll", handler, { passive: true });
        return () => window.removeEventListener("scroll", handler);
    }, []);

    return (
        <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-white/30 dark:supports-[backdrop-filter]:bg-black/20 border-b border-white/10">
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
                <Link
                    href="/#home"
                    aria-label="Go to home"
                    className="group relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-white shadow-sm hover:bg-white/10 transition-colors"
                >
                    <span className={`${signatureFont.className} text-base sm:text-lg leading-none tracking-wide`}>
                        Himanshu Kukreja
                    </span>
                    <span className="pointer-events-none absolute -inset-px rounded-full bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 group-hover:opacity-60 blur transition-opacity" />
                </Link>
                <nav className="hidden md:flex items-center gap-1">
                    {sections.map((s) => (
                        <Link
                            key={s.id}
                            href={`/#${s.id}`}
                            className={`px-3 py-2 rounded-full text-sm transition-colors ${active === s.id
                                ? "bg-white/10 text-white"
                                : "hover:bg-white/5 text-white/80"
                                }`}
                        >
                            {s.label}
                        </Link>
                    ))}
                    <Link
                        href="/stories"
                        className="px-3 py-2 rounded-full text-sm transition-colors hover:bg-white/5 text-white/80"
                        onClick={(e) => {
                            e.preventDefault(); // prevent default client navigation
                            window.location.href = "/stories"; // triggers full reload
                        }}
                    >
                        All Stories
                    </Link>
                </nav>
                <div className="flex items-center gap-2">
                    <a
                        href="/resume.pdf"
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border border-white/10 bg-transparent hover:bg-white/5 text-white"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <FileText className="h-4 w-4" />
                        <span className="hidden sm:inline">Resume</span>
                    </a>
                    <button
                        aria-label="Toggle theme"
                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm border border-white/10 bg-transparent hover:bg-white/5 text-white"
                        onClick={() =>
                            setTheme(resolvedTheme === "dark" ? "light" : "dark")
                        }
                    >
                        {/* Render both icons to keep SSR/CSR markup identical */}
                        <Sun className="h-4 w-4 hidden dark:block" />
                        <Moon className="h-4 w-4 block dark:hidden" />
                    </button>
                </div>
            </div>
        </header>
    );
}
