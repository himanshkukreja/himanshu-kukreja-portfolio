/**
 * Smart search launch switch. While false, /learn/search, its API routes and the ⌘K "Ask" row are for
 * admins only (the owner tries it first); ⌘K stays exactly as it was for everyone else. To launch: set
 * this to true (one line). Then, if wanted, add a "search" link to the Learn nav (src/components/site/LearnNav.tsx).
 */
export const SMART_SEARCH_PUBLIC = false;
