/** Where to find Himanshu online. One list for the hero, footer, ⌘K terminal and JSON-LD. */
export type SocialIconName = "github" | "linkedin" | "x" | "instagram" | "markdrop" | "email" | "resume";

export type Social = { id: string; label: string; handle: string; href: string; icon: SocialIconName };

export const EMAIL = "kukreja.him@gmail.com";

export const SOCIALS: Social[] = [
  { id: "github", label: "github", handle: "@himanshkukreja", href: "https://github.com/himanshkukreja", icon: "github" },
  { id: "linkedin", label: "linkedin", handle: "in/himanshukukreja", href: "https://www.linkedin.com/in/himanshukukreja/", icon: "linkedin" },
  { id: "x", label: "x.com", handle: "@hi_kukreja", href: "https://x.com/hi_kukreja", icon: "x" },
  { id: "instagram", label: "instagram", handle: "@himanshukreja_", href: "https://www.instagram.com/himanshukreja_", icon: "instagram" },
  { id: "markdrop", label: "markdrop.in", handle: "markdrop.in", href: "https://markdrop.in", icon: "markdrop" },
];
