// Per-language toolchain settings: source files, compile and run commands,
// memory accounting and time factors. All toolchains live under /usr, which
// isolate bind-mounts read-only into every box.

import type { ParsedSignature } from "./harness/types.ts";
import { generateDriver } from "./harness/index.ts";
import type { HarnessLanguage } from "./harness/index.ts";
import { javaStdioClass } from "./harness/java.ts";

export type Language = HarnessLanguage;
export type Mode = "function" | "stdio";

export const JDK = "/usr/lib/jvm/jdk21";
const JAVA_DIRS = ["/etc/java-21-openjdk:maybe"];
const BASE_ENV = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/box", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };

export const LANGUAGE_ALIASES: Record<string, { language: Language; std?: string }> = {
  cpp: { language: "cpp" },
  "c++": { language: "cpp" },
  cpp17: { language: "cpp", std: "c++17" },
  cpp20: { language: "cpp", std: "c++20" },
  java: { language: "java" },
  java21: { language: "java" },
  python: { language: "python" },
  python3: { language: "python" },
  py: { language: "python" },
  javascript: { language: "javascript" },
  js: { language: "javascript" },
  node: { language: "javascript" },
};

export interface Prepared {
  files: Record<string, string>;
  compile: string[] | null;
  run: string[];
}

export interface LangSpec {
  id: Language;
  /** CPU limit = timeMs * timeFactor + timeExtraMs (JVM/interpreter startup, JIT threads). */
  timeFactor: number;
  timeExtraMs: number;
  compileEnv: Record<string, string>;
  compileDirs: string[];
  runEnv: Record<string, string>;
  runDirs: string[];
  /** Box cgroup memory for a requested memory limit (MB). */
  runMemoryMb(requestedMb: number): number;
  prepare(mode: Mode, code: string, sig: ParsedSignature | null, opts: { std: string; memoryMb: number }): Prepared;
  /** Recognise out-of-memory failures that the runtime reports itself. */
  isOutOfMemory(stderr: string): boolean;
}

const CPP: LangSpec = {
  id: "cpp",
  timeFactor: 1,
  timeExtraMs: 0,
  compileEnv: BASE_ENV,
  compileDirs: [],
  runEnv: BASE_ENV,
  runDirs: [],
  runMemoryMb: (mb) => mb,
  prepare(mode, code, sig, opts) {
    const files = mode === "function" ? generateDriver("cpp", sig!, code).files : { "main.cpp": code };
    return {
      files,
      compile: [
        "/usr/bin/g++",
        `-std=${opts.std}`,
        "-O2",
        "-pipe",
        "-DONLINE_JUDGE",
        "-fdiagnostics-color=never",
        "-fmax-errors=20",
        "-o",
        "prog",
        "main.cpp",
      ],
      run: ["./prog"],
    };
  },
  isOutOfMemory: (s) => /std::bad_alloc/.test(s),
};

const JAVA: LangSpec = {
  id: "java",
  timeFactor: 1.5,
  timeExtraMs: 500,
  compileEnv: BASE_ENV,
  compileDirs: JAVA_DIRS,
  runEnv: BASE_ENV,
  runDirs: JAVA_DIRS,
  // Heap = the requested limit (-Xmx256m by default); the box gets twice that
  // for metaspace, code cache, thread stacks and the JVM itself (512 MB total).
  runMemoryMb: (mb) => mb * 2,
  prepare(mode, code, sig, opts) {
    let files: Record<string, string>;
    let mainClass = "Main";
    if (mode === "function") {
      files = generateDriver("java", sig!, code).files;
    } else {
      mainClass = javaStdioClass(code);
      files = { [`${mainClass}.java`]: code };
    }
    return {
      files,
      compile: [
        `${JDK}/bin/javac`,
        "-J-Xmx384m",
        "-J-XX:+UseSerialGC",
        "-J-XX:-UsePerfData",
        "-J-XX:TieredStopAtLevel=1",
        "-J-XX:ActiveProcessorCount=1",
        "-encoding",
        "UTF-8",
        "-nowarn",
        "-d",
        ".",
        ...Object.keys(files).sort(),
      ],
      run: [
        `${JDK}/bin/java`,
        `-Xmx${opts.memoryMb}m`,
        `-Xms${Math.min(64, opts.memoryMb)}m`,
        "-Xss64m",
        "-XX:+UseSerialGC",
        "-XX:-UsePerfData",
        "-XX:ActiveProcessorCount=1",
        "-XX:MaxMetaspaceSize=128m",
        "-XX:ReservedCodeCacheSize=64m",
        "-Xshare:auto",
        "-Dfile.encoding=UTF-8",
        "-cp",
        ".",
        mainClass,
      ],
    };
  },
  isOutOfMemory: (s) => /java\.lang\.OutOfMemoryError/.test(s),
};

const PYTHON: LangSpec = {
  id: "python",
  timeFactor: 3,
  timeExtraMs: 300,
  compileEnv: { ...BASE_ENV, PYTHONDONTWRITEBYTECODE: "1" },
  compileDirs: [],
  runEnv: { ...BASE_ENV, PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" },
  runDirs: [],
  runMemoryMb: (mb) => mb,
  prepare(mode, code, sig) {
    const files = mode === "function" ? generatePy(sig!, code) : { "main.py": code };
    const check = mode === "function" ? "solution.py" : "main.py";
    return {
      files,
      // Syntax check only: reports SyntaxError as CE without running anything.
      compile: [
        "/usr/bin/python3",
        "-c",
        "import sys\nfor f in sys.argv[1:]:\n    compile(open(f, encoding='utf-8').read(), f, 'exec')",
        check,
      ],
      run: ["/usr/bin/python3", "-B", "main.py"],
    };
  },
  isOutOfMemory: (s) => /\bMemoryError\b/.test(s),
};

function generatePy(sig: ParsedSignature, code: string): Record<string, string> {
  return generateDriver("python", sig, code).files;
}

const JAVASCRIPT: LangSpec = {
  id: "javascript",
  timeFactor: 2,
  timeExtraMs: 300,
  compileEnv: BASE_ENV,
  compileDirs: [],
  runEnv: BASE_ENV,
  runDirs: [],
  // V8 reserves a lot of address space but the cgroup counts resident memory.
  runMemoryMb: (mb) => mb + 64,
  prepare(mode, code, sig, opts) {
    const files = mode === "function" ? generateDriver("javascript", sig!, code).files : { "main.js": code };
    return {
      files,
      compile: ["/usr/local/bin/node", "--check", "main.js"],
      run: ["/usr/local/bin/node", `--max-old-space-size=${opts.memoryMb}`, "--stack-size=65500", "main.js"],
    };
  },
  isOutOfMemory: (s) => /JavaScript heap out of memory|Allocation failed/.test(s),
};

export const LANGUAGES: Record<Language, LangSpec> = { cpp: CPP, java: JAVA, python: PYTHON, javascript: JAVASCRIPT };
