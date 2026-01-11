"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Satisfy } from "next/font/google";
import AuthButton from "./AuthButton";

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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
        <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-black/20 border-b border-black/10 dark:border-white/10">
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
                <Link
                    href="/#home"
                    aria-label="Go to home"
                    className="group relative inline-flex items-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-1.5 text-gray-900 dark:text-white shadow-sm hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
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
                                ? "bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white"
                                : "hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80"
                                }`}
                        >
                            {s.label}
                        </Link>
                    ))}
                    <Link
                        href="/stories"
                        className="px-3 py-2 rounded-full text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80"
                    >
                        All Stories
                    </Link>
                    <Link
                        href="/learn"
                        className="px-3 py-2 rounded-full text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80 bg-gradient-to-r from-blue-500/10 to-purple-500/10"
                    >
                        Learn
                    </Link>
                </nav>
                <div className="flex items-center gap-1.5">
                    <button
                        aria-label="Toggle theme"
                        className="hidden md:inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm border border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-gray-900 dark:text-white"
                        onClick={() =>
                            setTheme(resolvedTheme === "dark" ? "light" : "dark")
                        }
                    >
                        {/* Render both icons to keep SSR/CSR markup identical */}
                        <Sun className="h-4 w-4 hidden dark:block" />
                        <Moon className="h-4 w-4 block dark:hidden" />
                    </button>

                    {/* Auth Button - Always visible */}
                    <AuthButton />

                    {/* Mobile Hamburger Menu */}
                    <button
                        aria-label="Toggle mobile menu"
                        className="md:hidden inline-flex items-center justify-center rounded-full px-3 py-2 text-sm border border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-gray-900 dark:text-white"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? (
                            <X className="h-5 w-5" />
                        ) : (
                            <Menu className="h-5 w-5" />
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 backdrop-blur-sm">
                    <nav className="px-4 py-4 space-y-2">
                        {sections.map((s) => (
                            <Link
                                key={s.id}
                                href={`/#${s.id}`}
                                className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
                                    active === s.id
                                        ? "bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white"
                                        : "hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80"
                                }`}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {s.label}
                            </Link>
                        ))}
                        <Link
                            href="/stories"
                            className="block px-4 py-2 rounded-lg text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            All Stories
                        </Link>
                        <Link
                            href="/learn"
                            className="block px-4 py-2 rounded-lg text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80 bg-gradient-to-r from-blue-500/10 to-purple-500/10"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Learn
                        </Link>
                        <div className="pt-4 mt-4 border-t border-black/10 dark:border-white/10">
                            <button
                                className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/80 text-left"
                                onClick={() => {
                                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                                }}
                            >
                                {resolvedTheme === "dark" ? (
                                    <>
                                        <Sun className="h-4 w-4" />
                                        Light Mode
                                    </>
                                ) : (
                                    <>
                                        <Moon className="h-4 w-4" />
                                        Dark Mode
                                    </>
                                )}
                            </button>
                        </div>
                    </nav>
                </div>
            )}
        </header>
    );
}
