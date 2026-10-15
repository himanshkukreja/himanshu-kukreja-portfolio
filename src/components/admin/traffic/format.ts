/** Small display helpers for the traffic screen. */

/** "IN" → 🇮🇳 (regional indicator pair); empty for unknown codes. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  const A = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(A + up.charCodeAt(0) - 65, A + up.charCodeAt(1) - 65);
}

export function axisLabel(unit: "hour" | "day" | "week" | undefined) {
  return (t: string | number) => {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return String(t);
    if (unit === "hour") return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    if (unit === "week") return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
}
