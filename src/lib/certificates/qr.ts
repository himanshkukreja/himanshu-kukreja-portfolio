/**
 * QR codes for certificates (qrcode-generator, MIT): the verification URL as one SVG path, so it
 * prints crisp at any size and needs no image request. Error correction M, automatic version.
 * Pure: used by the certificate components (server or client) and the Node tests.
 */
import qrcode from "qrcode-generator";

export type QrPath = { /** modules per side, without the quiet zone */ size: number; d: string };

export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Dark modules as horizontal runs, one `M x y h w v1 h-w z` per run (module units, origin 0,0). */
export function qrPath(text: string): QrPath {
  const m = qrMatrix(text);
  const n = m.length;
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) {
        c++;
        continue;
      }
      let e = c;
      while (e < n && m[r][e]) e++;
      d += `M${c} ${r}h${e - c}v1h-${e - c}z`;
      c = e;
    }
  }
  return { size: n, d };
}

/** A standalone SVG (quiet zone of `margin` modules), e.g. for tests or downloads. */
export function qrSvg(text: string, opts: { margin?: number; dark?: string; light?: string; px?: number } = {}): string {
  const { size, d } = qrPath(text);
  const margin = opts.margin ?? 4;
  const full = size + margin * 2;
  const px = opts.px ?? full * 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${full} ${full}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect x="${-margin}" y="${-margin}" width="${full}" height="${full}" fill="${opts.light ?? "#fff"}"/><path d="${d}" fill="${opts.dark ?? "#000"}"/></svg>`;
}
