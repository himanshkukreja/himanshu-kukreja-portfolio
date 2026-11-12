/**
 * The eval's learner fixtures (dsa-chat-cases.ts LearnerFixture) as the routes' inputs. Baseline: the DSA tutors read
 * nothing about the learner yet, so the fixtures change nothing.
 */
import type { DsaLang } from "@/lib/dsa/types";
import type { LearnerFixture } from "./dsa-chat-cases";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function learnerInputs(l: LearnerFixture | undefined, lang: DsaLang | null): Record<string, never> {
  return {};
}
