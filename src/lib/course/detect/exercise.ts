/**
 * ```bug / ```predict / ```order / ```breakit → an in-lesson exercise (src/lib/dsa/exercises.ts is the format and parser).
 * The figure is data-driven: the parsed block rides along in `data-ex` (JSON) and the client mounts the card into the empty
 * `[data-dsa-stage]` (src/components/dsa/lesson/exercises, via DsaHydrator). Without JavaScript it shows the question and
 * the first language's code, so a no-JS reader still sees the exercise. The whole figure is chrome: it is not course text,
 * so highlight offsets ignore it.
 */
import type { Element as HastElement } from "hast";
import { chrome, h } from "../md";
import { EX_LABEL, exerciseTitle, isExKind, parseExercise, pickLang, EX_LANGS, type Exercise, type ExKind } from "@/lib/dsa/exercises";

function staticCode(ex: Exercise): string {
  const l = pickLang(ex.code as Record<string, unknown>, "python");
  if (!l) return "";
  if (ex.kind === "bug") return ex.code[l]!.lines.join("\n");
  if (ex.kind === "order") return ex.code[l]!.map((x) => x.text).join("\n");
  return ex.code[l] as string;
}

/** Render one exercise fence; null when it is not a valid exercise (the caller falls back to a plain code block). */
export function exerciseFigure(kindRaw: string, value: string): HastElement | null {
  if (!isExKind(kindRaw)) return null;
  const kind = kindRaw.toLowerCase() as ExKind;
  const r = parseExercise(kind, value);
  if (!r.ok) return null;
  const ex = r.ex;
  const title = exerciseTitle(kind, ex.title);
  const hasCode = EX_LANGS.some((l) => (ex.code as Record<string, unknown>)[l] !== undefined);
  return chrome(
    "figure",
    {
      className: ["sdb", "dsa-block", "dsa-widget", "dsa-exercise"],
      dataSd: "dsa-exercise",
      dataSdBlock: "dsa-exercise",
      dataDsa: "exercise",
      dataId: ex.id,
      dataExKind: kind,
      dataEx: JSON.stringify(ex),
      id: `ex-${ex.id}`,
    },
    [
      h("p", { className: ["dsa-fallback"] }, [h("strong", {}, [`Exercise · ${EX_LABEL[kind]}${title ? `: ${title}` : ""}. `]), ex.question]),
      hasCode ? h("pre", { className: ["dsa-fallback"] }, [h("code", {}, [staticCode(ex)])]) : null,
      chrome("div", { className: ["dsa-stage"], dataDsaStage: "" }, []),
    ],
  );
}
