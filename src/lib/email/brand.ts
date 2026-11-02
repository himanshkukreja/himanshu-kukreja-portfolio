import { COURSE_ORIGIN } from "@/lib/site/hosts";

/**
 * The course's brand bar for every email (welcome, campaigns, announcements, case files, reminders, peer mocks):
 * the diagram mark (a PNG: mail clients don't render SVG) + "System Design Mastery." in the display face.
 */
export const COURSE_MARK_PNG = `${COURSE_ORIGIN}/course-brand/icons/icon-192.png`;

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";

/** Inline style for the cell that holds `courseBrand()`. */
export const COURSE_BRAND_CELL = `font-family:${F_DISPLAY};font-size:17px;font-weight:800;letter-spacing:-0.02em;white-space:nowrap;`;

/** Mark + name + dot. `ink` colours the name (light text on the black bars, ink on light ones), `dot` the full stop. */
export function courseBrand({ ink = "#F3F2EE", dot = "#FF6B2B" }: { ink?: string; dot?: string } = {}): string {
  return `<img src="${COURSE_MARK_PNG}" width="22" height="22" alt="" style="display:inline-block;width:22px;height:22px;border:0;vertical-align:-5px;margin-right:8px;"><span style="color:${ink};">System Design Mastery</span><span style="color:${dot};">.</span>`;
}
