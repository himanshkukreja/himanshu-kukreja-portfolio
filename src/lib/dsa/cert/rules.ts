/**
 * The DSA Mastery · Foundations certificate: its earning rules (pure, so the requirements page in the browser and the
 * claim on the server run the same function over the same world spec).
 *
 * Earned by finishing the Academy (plan §8.6): every required concept, practice problem and checkpoint on the Academy
 * campus (the same progress the map shows, computeWorld), every building's review (game key
 * `dsa:boss:academy:<region>`) and the Launch week final (`dsa:world:academy`). A node whose content isn't released
 * yet can't be done, so the certificate can't be earned while any part of the Academy is still being written: nobody
 * gets it for an unfinished course. The reviews and the final aren't built yet; until they are, the page shows them as
 * coming soon and the progress so far.
 *
 * Codes: DSA-XXXX-XXXX (the SD Mastery alphabet: digits 2-9 and A-Z without I and O). Stored in `certificates` with
 * kind 'dsa' and world_key 'foundations' (supabase/migrations/20261109_dsa_launch_1b.sql widens its checks).
 */
import { computeWorld, type ProgressSignals } from "../map/progress";
import type { WorldNode, WorldSpec } from "../types";

export const DSA_CERT_WORLD = "academy";
export const DSA_CERT_TRACK = "foundations";
export const DSA_CERT_KIND = "dsa";
export const DSA_CERT_NAME = "DSA Mastery · Foundations";
export const DSA_CERT_XP = 500;
export const dsaCertXpKey = () => `cert:dsa:${DSA_CERT_TRACK}`;

const SYM = "[2-9A-HJ-NP-Z]";
export const DSA_CODE_RE = new RegExp(`^DSA-${SYM}{4}-${SYM}{4}$`);
export const isDsaCode = (c: string) => DSA_CODE_RE.test(c);
export const dsaCertPath = (code: string) => `/dsa/cert/${code}`;

export const bossKey = (world: string, region: string) => `dsa:boss:${world}:${region}`;
export const worldKey = (world: string) => `dsa:world:${world}`;

export type DsaReqId = "lessons" | "practice" | "checkpoints" | "reviews" | "final";

export type DsaRequirement = {
  id: DsaReqId;
  label: string;
  /** one line on what counts */
  detail: string;
  done: number;
  total: number;
  /** how many of `total` are released (built) */
  built: number;
  complete: boolean;
  /** some of it isn't released yet */
  comingSoon: boolean;
  /** the next few released items not done yet */
  todo: { label: string; href: string | null }[];
};

export type DsaEligibility = { eligible: boolean; requirements: DsaRequirement[]; pct: number; done: number; total: number };

export type DsaCertSignals = ProgressSignals & {
  /** game keys for reviews and the final: dsa:boss:<world>:<region>, dsa:world:<world> */
  milestones: ReadonlySet<string>;
};

function req(id: DsaReqId, label: string, detail: string, items: { node: WorldNode | null; done: boolean; label: string }[]): DsaRequirement {
  const total = items.length;
  const built = items.filter((x) => x.node?.built).length;
  const done = items.filter((x) => x.done).length;
  return {
    id,
    label,
    detail,
    done,
    total,
    built,
    complete: total > 0 && done === total,
    comingSoon: built < total,
    todo: items
      .filter((x) => !x.done && x.node?.built)
      .slice(0, 4)
      .map((x) => ({ label: x.label, href: x.node?.href ?? null })),
  };
}

export function foundationsEligibility(spec: WorldSpec, s: DsaCertSignals): DsaEligibility {
  const prog = computeWorld(spec, s);
  const concepts: { node: WorldNode; done: boolean; label: string }[] = [];
  const practice: typeof concepts = [];
  const checkpoints: typeof concepts = [];
  const reviews: { node: WorldNode | null; done: boolean; label: string }[] = [];
  for (const r of spec.regions) {
    for (const st of r.stretches) {
      for (const n of st.nodes) {
        if (!n.required) continue;
        const done = prog.states[n.id] === "done";
        if (n.type === "concept") concepts.push({ node: n, done, label: n.title });
        else if (n.type === "practice") practice.push({ node: n, done, label: n.title });
        else if (n.type === "checkpoint") checkpoints.push({ node: n, done, label: `${r.title} · ${st.title} checkpoint` });
      }
    }
    if (r.boss) reviews.push({ node: r.boss, done: !!r.boss.built && s.milestones.has(bossKey(spec.id, r.id)), label: r.boss.title });
  }
  const final = spec.final ? [{ node: spec.final, done: !!spec.final.built && s.milestones.has(worldKey(spec.id)), label: spec.final.title }] : [];
  const requirements = [
    req("lessons", "Every concept lesson", "Read each concept to the end (its Say beat).", concepts),
    req("practice", "Every practice problem", "An Accepted submit on each required problem on the campus paths.", practice),
    req("checkpoints", "Every checkpoint", "Pass the checkpoint quiz (80%) and solve both of its problems.", checkpoints),
    req("reviews", "Every building review", "The timed review at the end of each building.", reviews),
    req("final", "The Launch week final", "The Academy's final: a timed mixed set in Launch Hall.", final),
  ];
  const done = requirements.reduce((a, r) => a + r.done, 0);
  const total = requirements.reduce((a, r) => a + r.total, 0);
  return { eligible: requirements.every((r) => r.complete && !r.comingSoon), requirements, pct: total ? Math.floor((done / total) * 100) : 0, done, total };
}

/** Signals from game_done keys (the map's own source), plus learning_progress / submit rows the server adds. */
export function signalsFromGame(done: Record<string, number> | null | undefined): DsaCertSignals {
  const solved = new Set<string>();
  const concepts = new Set<string>();
  const checkpoints = new Set<string>();
  const milestones = new Set<string>();
  for (const k of Object.keys(done || {})) {
    if (k.startsWith("dsa:p:")) solved.add(k.slice(6));
    else if (k.startsWith("dsa:c:")) concepts.add(k.slice(6));
    else if (k.startsWith("dsa:cpq:")) checkpoints.add(k.slice(8));
    else if (k.startsWith("dsa:boss:") || k.startsWith("dsa:world:")) milestones.add(k);
  }
  return { solved, concepts, checkpoints, milestones };
}

/** What a certificate's evidence keeps (frozen at issue time) and its public page shows. */
export type DsaCertEvidence = { track: string; lessons: number; problems: number; checkpoints: number; reviews: number; languages: string[]; solvedByLevel: { easy: number; medium: number; hard: number } };

export type DsaCertView = {
  code: string;
  name: string;
  issuedAt: string;
  status: "valid" | "revoked";
  isPublic: boolean;
  evidence: Partial<DsaCertEvidence>;
  /** "ok" | "bad" | "unchecked" (the signature check on the server) */
  signature: "ok" | "bad" | "unchecked";
};
