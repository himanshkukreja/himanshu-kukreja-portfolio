// Driver generator entry point: one language-neutral signature, a driver per
// language (plan 7.1: "One driver generator serves the browser, the judge and
// the checker"). The browser harness should import this module (it has no
// Node dependencies) so both sides agree on names and encodings.

import type { ParsedSignature } from "./types.ts";
import type { GeneratedSource } from "./cpp.ts";
import { generateCpp } from "./cpp.ts";
import { generateJava } from "./java.ts";
import { generatePython } from "./python.ts";
import { generateJavaScript } from "./javascript.ts";

export type HarnessLanguage = "cpp" | "java" | "python" | "javascript";

export function generateDriver(language: HarnessLanguage, sig: ParsedSignature, learnerCode: string): GeneratedSource {
  switch (language) {
    case "cpp":
      return generateCpp(sig, learnerCode);
    case "java":
      return generateJava(sig, learnerCode);
    case "python":
      return generatePython(sig, learnerCode);
    case "javascript":
      return generateJavaScript(sig, learnerCode);
  }
}

export { RESULT_FILE } from "./cpp.ts";
export { parseSignature, parseType, fnNameFor, camelCase, snakeCase, SignatureError } from "./types.ts";
export type { Signature, ParsedSignature, TypeNode } from "./types.ts";
