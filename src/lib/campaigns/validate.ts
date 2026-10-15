/** Content checks shared by the composer (live) and the server (before test sends + queueing). Pure. */
import { docFields, type EmailContent } from "./render";
import { checkField, type TagProblem } from "./tags";

export function contentProblems(c: EmailContent): TagProblem[] {
  const problems = [...checkField("Subject", c.subject), ...checkField("Subject fallback", c.subjectFallback), ...checkField("Preheader", c.preheader)];
  for (const f of docFields(c.doc)) problems.push(...checkField(f.where, f.value));
  if (!c.subject.trim()) problems.push({ where: "Subject", raw: "", message: "Subject is empty." });
  if (c.doc.layout === "raw" && !c.doc.html.includes("{{unsubscribe_url}}")) problems.push({ where: "HTML", raw: "", message: "The HTML has no {{unsubscribe_url}} link." });
  if (c.doc.layout === "blocks" && !c.doc.blocks.length) problems.push({ where: "Body", raw: "", message: "Add at least one block." });
  return problems;
}
