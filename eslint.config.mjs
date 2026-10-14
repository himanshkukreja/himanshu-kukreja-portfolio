// eslint-config-next 16 ships native flat configs, so they are imported directly
// (wrapping them in FlatCompat crashed with "Converting circular structure to JSON",
// which meant lint silently never ran in `next build`).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const asArray = (config) => (Array.isArray(config) ? config : [config]);

// Files written before the "Level Up" redesign that still carry old lint debt.
// Rules are downgraded to warnings ONLY for these paths; remove a path once its file is redesigned.
const LEGACY_FILES = [
  "src/app/api/admin/analytics/route.ts",
  "src/app/api/admin/user-analytics/route.ts",
  "src/app/api/admin/users/route.ts",
  "src/app/api/analytics/track/route.ts",
  "src/app/api/bookmarks/route.ts",
  "src/app/api/notes/route.ts",
  "src/app/api/profile/route.ts",
  "src/app/api/progress/route.ts",
  "src/app/api/revalidate-courses/route.ts",
  "src/app/api/search/route.ts",
  "src/app/api/send-welcome-email/route.ts",
  "src/app/api/test-insert/route.ts",
  "src/app/api/test-supabase/route.ts",
  "src/app/auth/callback/page.tsx",
  "src/app/learn/bookmarks/page.tsx",
  "src/app/learn/notes/page.tsx",
  "src/components/CollapsibleNoteCard.tsx",
  "src/components/ContinueReadingBanner.tsx",
  "src/components/Hero.tsx",
  "src/components/HighlightableContent.tsx",
  "src/components/LessonCard.tsx",
  "src/components/LessonComments.tsx",
  "src/components/NoteEditor.tsx",
  "src/components/ReadAloud.tsx",
  "src/components/RichTextEditor.tsx",
  "src/components/SearchBar.tsx",
  "src/components/TextSelectionMenu.tsx",
  "src/components/UserAdmin.tsx",
  "src/contexts/AuthContext.tsx",
  "src/lib/analytics.ts",
  "src/lib/reading-time.ts",
  "src/lib/supabase-client.ts",
];

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "**/*.bak*", "next-env.d.ts"] },
  ...asArray(coreWebVitals),
  ...asArray(typescript),
  {
    files: LEGACY_FILES,
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "prefer-const": "warn",
    },
  },
];

export default eslintConfig;
