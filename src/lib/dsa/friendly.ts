/**
 * Friendly errors for the problem room (the beginner pass, owner 9 Nov 2026): a Python or JavaScript error from the
 * browser judge as one plain sentence first ("Line 4: `nums[i + 1]` asked for a position past the end of the list…"),
 * the raw message kept in a disclosure under it. Deterministic: patterns on the error's kind, message and the line of
 * the learner's code it points at; no AI. Returns null when it has nothing better to say than the raw message.
 */
import type { DsaLang } from "./types";

export type FriendlyInput = {
  verdict: string;
  /** the raw text: "IndexError: list index out of range", "SyntaxError: … (line 3)", the timeout note… */
  message: string;
  /** the line in the learner's code, when the runner reported one */
  line?: number | null;
  /** the code that ran */
  code: string;
  lang: DsaLang;
  /** the function's name, for "keep the name" errors */
  fn?: string;
};

const tick = (s: string) => `\`${s.trim()}\``;
const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** `name[expr]` reads on a line, most specific (with + or -) first. */
function indexReads(line: string): { whole: string; name: string; expr: string }[] {
  const out: { whole: string; name: string; expr: string }[] = [];
  const re = /([A-Za-z_][\w.]*)\s*\[([^\[\]]+)\]/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (/^\s*-?\d+\s*:?\s*-?\d*\s*$/.test(m[2]) && !/[+-]/.test(m[2])) continue; // nums[0], a[1:3]: rarely the culprit
    if (m[2].includes(":")) continue; // slices never raise IndexError
    out.push({ whole: m[0], name: m[1], expr: m[2].trim() });
  }
  return out.sort((a, b) => Number(/[+-]/.test(b.expr)) - Number(/[+-]/.test(a.expr)));
}

/** The line number from a message's "(line 3)" / "line 3" when the runner didn't give one. */
function lineFrom(message: string): number | null {
  // the runner's own "(line 4)" at the end wins over a line the message mentions ("…after 'for' statement on line 3")
  const m = message.match(/\(line (\d+)\)\s*$/i) || message.match(/\bline (\d+)\b/i);
  return m ? Number(m[1]) : null;
}

export function friendlyError(x: FriendlyInput): string | null {
  const t = sentence(x);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

function sentence(x: FriendlyInput): string | null {
  const msg = x.message.trim();
  const lineNo = x.line ?? lineFrom(msg);
  const src = lineNo ? (x.code.split("\n")[lineNo - 1] ?? "").trim() : "";
  const at = lineNo ? `Line ${lineNo}: ` : "";
  const shown = src ? tick(clip(src)) : "your code";
  const py = x.lang === "python";

  // time and memory
  if (x.verdict === "TLE" || /took longer than|took \d+ ms \(limit/.test(msg))
    return "Your code ran out of time. Usually a loop that never ends (a while whose condition never turns false, or an index or pointer that never moves), or an approach that is too slow for the biggest tests.";
  if (x.verdict === "MLE" || /MemoryError|Invalid array length|Array buffer allocation/.test(msg))
    return "Your code used too much memory. Look for a list or string that keeps growing inside a loop, or a copy made on every step.";

  // the function's name
  if (/define a function named/.test(msg)) return `The tests call your function by its name${x.fn ? `, ${tick(x.fn)}` : ""}. Keep that name (and its parameters) exactly as in the starter code.`;

  // recursion
  if (/RecursionError|maximum recursion depth|maximum call stack size exceeded/i.test(msg))
    return `${at}your function kept calling itself and never stopped. Check the base case: the smallest input must return an answer without calling the function again.`;

  // syntax and indentation
  if (/IndentationError|TabError/.test(msg)) {
    if (/expected an indented block/.test(msg)) return `${at}the line after a line ending in a colon (if, for, while, def) must be indented one level more, usually 4 spaces.`;
    if (/unindent does not match|inconsistent use of tabs/.test(msg) || /TabError/.test(msg)) return `${at}this line's indentation doesn't line up with the lines above it. Use 4 spaces per level and don't mix tabs with spaces.`;
    if (/unexpected indent/.test(msg)) return `${at}this line is indented more than it should be. Line it up with the block it belongs to.`;
    return `${at}the indentation is off. In Python, indentation shows which lines belong to an if, a loop or a function: use 4 spaces per level.`;
  }
  if (/SyntaxError/.test(msg)) {
    if (/expected ':'/.test(msg)) return `${at}a colon is missing. In Python, lines that start an if, elif, else, for, while or def end with a colon (:).`;
    if (/was never closed|unexpected EOF|EOF while scanning|Unexpected end of input/.test(msg)) return `${at}a bracket or parenthesis is opened but never closed. Count the ( [ { and the ) ] } on this line and the ones above it.`;
    if (/unterminated string|EOL while scanning|Invalid or unexpected token/.test(msg)) return `${at}a string is missing its closing quote.`;
    if (/invalid syntax\. Maybe you meant '==' or ':='/.test(msg) || /cannot assign to/.test(msg)) return `${at}this compares with a single =. To compare two values use ==; a single = stores a value.`;
    if (/Missing parentheses in call to 'print'/.test(msg)) return `${at}print needs parentheses in Python 3: print(x).`;
    return `${at}${py ? "Python" : "JavaScript"} couldn't read this line${src ? ` (${shown})` : ""}. Look for a missing ${py ? "colon, " : ""}bracket, quote or operator, or a typo in a keyword.`;
  }

  // Python runtime errors
  if (/IndexError/.test(msg)) {
    if (/pop from empty/.test(msg)) return `${at}${shown} took an item from an empty list. Check that it has items first (for example, if stack:).`;
    const reads = indexReads(src);
    const r = reads[0];
    const kind = /string index/.test(msg) ? "string" : "list";
    const what = r ? tick(r.whole) : shown;
    let tail = ` A ${kind} of n items has positions 0 to n - 1.`;
    if (r && /\+\s*\d|\+\s*[A-Za-z_]/.test(r.expr)) {
      const v = r.expr.split("+")[0].trim();
      tail = /\+\s*1$/.test(r.expr)
        ? ` When ${tick(v)} is the last index, ${tick(r.expr)} is one past the end: check where your loop stops (often range(len(${r.name}) - 1)).`
        : ` Near the end, ${tick(r.expr)} goes past the last index: check where your loop stops.`;
    } else if (r && /-\s*\d/.test(r.expr)) {
      tail = ` In Python a negative position counts from the end, so this usually means the ${kind} is empty or the position went far below 0.`;
    } else if (r) {
      tail = ` ${tick(r.expr)} reached a position the ${kind} doesn't have (it has positions 0 to len(${r.name}) - 1). Check the loop's last step and an empty input.`;
    }
    return `${at}${what} asked for a position past the end of the ${kind}.${tail}`;
  }
  if (/KeyError/.test(msg)) {
    const key = msg.match(/KeyError:\s*(.+)$/)?.[1]?.trim();
    return `${at}the dictionary has no key ${key ? tick(clip(key, 24)) : "like that"} yet. Read it with .get(key, 0), or check if key in your_dict first.`;
  }
  if (/ZeroDivisionError|division by zero|modulo by zero/.test(msg)) return `${at}${shown} divides by zero. Check the number you divide by isn't 0 first (an empty list has length 0, for example).`;
  if (/UnboundLocalError|referenced before assignment|where it is not associated with a value/.test(msg)) {
    const name = msg.match(/variable '([^']+)'/)?.[1];
    return `${at}${name ? tick(name) : "a variable"} is used before it gets a value. Give it a starting value before the loop or the if that sets it.`;
  }
  if (/NameError|ReferenceError/.test(msg)) {
    const name = msg.match(/name '([^']+)' is not defined/)?.[1] || msg.match(/ReferenceError:\s*(\S+) is not defined/)?.[1];
    return `${at}${py ? "Python" : "JavaScript"} doesn't know the name ${name ? tick(name) : "used here"}. Check the spelling (capital letters count) and that it gets a value before this line.`;
  }
  if (/TypeError/.test(msg) && /NoneType|undefined|null/.test(msg)) {
    const prop = msg.match(/reading '([^']+)'/)?.[1];
    if (!py && /Cannot read propert/.test(msg))
      return `${at}${shown} used a value that is undefined${prop ? `, so it has no ${tick(prop)}` : ""}. Often an index past the end of an array (nums[i] is undefined once i reaches nums.length) or a variable that was never set.`;
    return `${at}a value here is None (nothing), so ${shown} can't use it. Usually a function that forgot to return a value, or a variable that was never set.`;
  }
  if (/TypeError/.test(msg)) {
    if (/'int' object is not iterable/.test(msg)) return `${at}${shown} loops over a number. To loop over positions, use range(len(...)); to loop over the items, loop over the list itself.`;
    if (/'int' object is not subscriptable|'int' object is not callable/.test(msg)) return `${at}${shown} treats a number like a list or a function. Check which variable holds the number and which holds the list.`;
    if (/can only concatenate str|unsupported operand type|must be str, not int/.test(msg)) return `${at}${shown} mixes types that don't go together (like text + a number). Convert one with str() or int() first.`;
    if (/missing \d+ required positional argument|takes \d+ positional argument/.test(msg)) return `${at}a function got the wrong number of values. Compare the call with the function's parameters.`;
    if (/is not a function/.test(msg)) return `${at}${shown} calls something that isn't a function. Check the name and the brackets: arrays use [ ], calls use ( ).`;
    return null;
  }
  if (/AttributeError/.test(msg)) {
    const m = msg.match(/'(\w+)' object has no attribute '(\w+)'/);
    if (m) return `${at}a ${m[1]} has no ${tick(m[2])}.${m[1] === "list" && m[2] === "push" ? " In Python, add to a list with append." : m[1] === "NoneType" ? " The value is None: a function that didn't return, or a variable that was never set." : " Check the spelling, or which variable holds what."}`;
    return null;
  }
  if (/AssertionError/.test(msg)) return null;
  return null;
}

/** A wrong answer that is just "nothing": the function never returned a value. */
export function friendlyWrong(got: string | undefined, lang: DsaLang): string | null {
  if (got === "null" || got === "None" || got === "undefined")
    return lang === "python" ? "Your function returned nothing (None). Did it reach a return line? Every path through the function needs to return the answer." : "Your function returned nothing (undefined). Every path through the function needs a return with the answer.";
  return null;
}
