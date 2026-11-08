// A small JSON parser that keeps number literals as text, so 64-bit integers
// (Java long, C++ long long) compare exactly instead of going through doubles.

export type LJson =
  | { t: "num"; raw: string }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" }
  | { t: "arr"; v: LJson[] }
  | { t: "obj"; v: Map<string, LJson> };

export class JsonParseError extends Error {}

export function parseLossless(text: string): LJson {
  let i = 0;
  const s = text;
  const ws = () => {
    while (i < s.length && (s[i] === " " || s[i] === "\n" || s[i] === "\r" || s[i] === "\t")) i++;
  };
  const fail = (m: string): never => {
    throw new JsonParseError(`${m} at offset ${i}`);
  };
  const value = (depth: number): LJson => {
    if (depth > 512) fail("nesting too deep");
    ws();
    const c = s[i];
    if (c === "{") {
      i++;
      const m = new Map<string, LJson>();
      ws();
      if (s[i] === "}") {
        i++;
        return { t: "obj", v: m };
      }
      for (;;) {
        ws();
        if (s[i] !== '"') fail("expected key");
        const k = str();
        ws();
        if (s[i] !== ":") fail("expected :");
        i++;
        m.set(k, value(depth + 1));
        ws();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "}") {
          i++;
          return { t: "obj", v: m };
        }
        fail("expected , or }");
      }
    }
    if (c === "[") {
      i++;
      const a: LJson[] = [];
      ws();
      if (s[i] === "]") {
        i++;
        return { t: "arr", v: a };
      }
      for (;;) {
        a.push(value(depth + 1));
        ws();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "]") {
          i++;
          return { t: "arr", v: a };
        }
        fail("expected , or ]");
      }
    }
    if (c === '"') return { t: "str", v: str() };
    if (s.startsWith("true", i)) {
      i += 4;
      return { t: "bool", v: true };
    }
    if (s.startsWith("false", i)) {
      i += 5;
      return { t: "bool", v: false };
    }
    if (s.startsWith("null", i)) {
      i += 4;
      return { t: "null" };
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i, i + 400));
    if (!m) fail("unexpected token");
    i += m![0].length;
    return { t: "num", raw: m![0] };
  };
  const str = (): string => {
    // Find the closing quote, honouring escapes, then let JSON.parse decode it.
    const start = i;
    i++;
    while (i < s.length && s[i] !== '"') i += s[i] === "\\" ? 2 : 1;
    if (i >= s.length) fail("unterminated string");
    i++;
    return JSON.parse(s.slice(start, i)) as string;
  };
  const v = value(0);
  ws();
  if (i !== s.length) fail("trailing characters");
  return v;
}

const INT_RE = /^-?\d+$/;

export function isIntegerLiteral(raw: string): boolean {
  return INT_RE.test(raw);
}

/** Canonical text for a value; integers normalised via BigInt, floats via Number. */
export function canonical(v: LJson): string {
  switch (v.t) {
    case "num":
      return isIntegerLiteral(v.raw) ? BigInt(v.raw).toString() : String(Number(v.raw));
    case "str":
      return JSON.stringify(v.v);
    case "bool":
      return v.v ? "true" : "false";
    case "null":
      return "null";
    case "arr":
      return `[${v.v.map(canonical).join(",")}]`;
    case "obj":
      return `{${[...v.v.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
        .join(",")}}`;
  }
}
