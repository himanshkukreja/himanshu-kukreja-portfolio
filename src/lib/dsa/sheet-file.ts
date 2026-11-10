/**
 * Writes a Sheet (sheet-export.ts) to a file in the browser. exceljs is imported on the first Export click only, so it
 * stays out of the page's bundle and the Worker's. CSV needs no library.
 */
import { exportFileName, COLUMNS, type Cell, type Format, type Sheet } from "./sheet-export";

export type SheetMeta = { filters: string; scopeLabel: string; pageUrl: string; date: Date };

const TEAL = "FF0F766E";
const TINT = "FFCCFBF1";
const LEVEL_FILL = { easy: "FFD1FAE5", medium: "FFFEF3C7", hard: "FFFEE2E2" } as const;
const LEVEL_INK = { easy: "FF065F46", medium: "FF92400E", hard: "FF991B1B" } as const;
const LINK_INK = "FF0F766E";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV carries each link as its own column ("Problem link", "Video link"…), since a CSV cell cannot hold a hyperlink. */
export function toCsv(sheet: Sheet): string {
  const linked = sheet.columns.map((_, i) => sheet.sections.some((s) => s.rows.some((r) => r[i]?.link && r[i].link !== r[i].text)));
  const head = sheet.header.flatMap((h, i) => (linked[i] ? [h, `${h} link`] : [h]));
  const lines = [head.map(csvCell).join(",")];
  for (const s of sheet.sections)
    for (const r of s.rows) lines.push(r.flatMap((c: Cell, i) => (linked[i] ? [c.text, c.link || ""] : [c.text])).map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function downloadSheet(sheet: Sheet, format: Format, meta: SheetMeta): Promise<void> {
  const name = exportFileName(format, meta.date);
  if (format === "csv") {
    save(new Blob([toCsv(sheet)], { type: "text/csv;charset=utf-8" }), name);
    return;
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DSA Mastery";
  wb.created = meta.date;
  const ws = wb.addWorksheet("Problems", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = sheet.columns.length;
  ws.columns = sheet.columns.map((id) => ({ width: COLUMNS.find((c) => c.id === id)!.width }));
  const head = ws.addRow(sheet.header);
  head.height = 24;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    c.alignment = { vertical: "middle", horizontal: "left" };
  });
  for (const s of sheet.sections) {
    if (s.title) {
      const r = ws.addRow([s.title]);
      ws.mergeCells(r.number, 1, r.number, cols);
      r.height = 22;
      const c = r.getCell(1);
      c.font = { bold: true, color: { argb: TEAL }, size: 11 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINT } };
      c.alignment = { vertical: "middle" };
    }
    for (const cells of s.rows) {
      const r = ws.addRow(cells.map((c) => (c.link ? { text: c.text, hyperlink: c.link } : c.text)));
      r.alignment = { vertical: "top", wrapText: true };
      cells.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        if (c.link) cell.font = { color: { argb: LINK_INK }, underline: true };
        if (c.level) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LEVEL_FILL[c.level] } };
          cell.font = { color: { argb: LEVEL_INK[c.level] }, bold: true };
        }
        if (sheet.columns[i] === "num") cell.alignment = { vertical: "top", horizontal: "center" };
      });
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: cols } };

  const about = wb.addWorksheet("About");
  about.columns = [{ width: 18 }, { width: 80 }];
  const rows: [string, string | { text: string; hyperlink: string }][] = [
    ["DSA Mastery", "Problem sheet"],
    ["Exported on", meta.date.toISOString().slice(0, 10)],
    ["Problems", String(sheet.count)],
    ["Which problems", meta.scopeLabel],
    ["Filters", meta.filters || "None"],
    ["Problems page", { text: meta.pageUrl, hyperlink: meta.pageUrl }],
    ["Note", "Solution video and editorial links open on the platform and unlock after a solve or a reveal, like on the site."],
  ];
  rows.forEach(([k, v], i) => {
    const r = about.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: i === 0 ? "FFFFFFFF" : TEAL } };
    if (i === 0) {
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
        c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      });
    }
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.getCell(1).alignment = { vertical: "top" };
    if (typeof v !== "string") r.getCell(2).font = { color: { argb: LINK_INK }, underline: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
}
