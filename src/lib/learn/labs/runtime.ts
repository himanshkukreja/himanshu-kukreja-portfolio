/**
 * The code-lab Python runtime: Pyodide (CPython compiled to WebAssembly), self-hosted under
 * public/pyodide/<version>/ so no third-party CDN is involved and the service worker can keep it
 * for offline use. The files are copied from node_modules/pyodide by scripts/labs/vendor-pyodide.mjs
 * (runs before `next dev` / `next build`; public/pyodide/ is git-ignored).
 *
 * Bumping Pyodide: change the exact version in package.json, PYODIDE_VERSION here and
 * RUNTIME_PREFIX in public/sw.js (the vendor script fails the build when they disagree).
 * Editing public/labs-runtime/py-worker.mjs: bump WORKER_REV so browsers and the offline cache
 * pick up the new file.
 */
export const PYODIDE_VERSION = "314.0.7";
export const PYTHON_VERSION = "3.14";
export const PYODIDE_BASE = `/pyodide/${PYODIDE_VERSION}/`;
export const WORKER_REV = "1";
export const WORKER_URL = `/labs-runtime/py-worker.mjs?v=${PYODIDE_VERSION}-${WORKER_REV}`;

/** Every file a lab run needs, in load order (the worker, the loader, the interpreter, the stdlib). */
export const RUNTIME_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
export const RUNTIME_URLS = [WORKER_URL, ...RUNTIME_FILES.map((f) => PYODIDE_BASE + f)];

/**
 * Bytes stored for offline use (uncompressed: Cache Storage keeps the decoded body), measured on
 * 314.0.7: wasm 9.6 MB, stdlib 2.5 MB, asm loader 1.25 MB, lock file 0.12 MB, loader + worker.
 */
export const RUNTIME_BYTES = 13_540_000;

/** What a first run downloads (gzip over the network: wasm 3.6 MB, stdlib zip 2.5 MB, loader 0.3 MB). */
export const RUNTIME_DOWNLOAD_LABEL = "~6.5 MB";
/** What it takes in Cache Storage once saved for offline use. */
export const RUNTIME_STORED_LABEL = "~13.5 MB";
