import "server-only";
import { isAdminEmail, normEmail } from "@/lib/admin/admins";
import { DSA_MODE } from "./flags";

/**
 * Who may use DSA Mastery's paid APIs (the judge, AI) before launch (plan §15.1, mode beta on staging): admins, plus
 * the beta testers listed in DSA_BETA_EMAILS (comma-separated). After launch (NEXT_PUBLIC_DSA_MODE=on) everyone
 * signed in may; in "soon" mode nobody (the routes answer 404 before this is asked).
 */
export async function dsaBetaAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if ((process.env.NEXT_PUBLIC_DSA_MODE || "").trim().toLowerCase() === "on") return true;
  if (DSA_MODE !== "full") return false;
  if (await isAdminEmail(email)) return true;
  const list = (process.env.DSA_BETA_EMAILS || "").split(",").map(normEmail).filter(Boolean);
  return list.includes(normEmail(email));
}
