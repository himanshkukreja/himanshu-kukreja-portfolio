// Sandbox abstraction. Production (and local Docker) use isolate (isolate.ts).
// Tests can substitute a fake implementing the same interface.

export interface RunSpec {
  /** argv; argv[0] must be an absolute path or ./relative to the box dir. */
  cmd: string[];
  /** File names inside the box. */
  stdin?: string;
  stdout: string;
  stderr?: string;
  stderrToStdout?: boolean;
  /** CPU time limit (seconds). */
  timeSec: number;
  wallSec: number;
  extraTimeSec?: number;
  /** Total memory of the box's cgroup (KB). */
  memoryKb: number;
  processes: number;
  fileSizeKb: number;
  stackKb?: number;
  openFiles?: number;
  env: Record<string, string>;
  /** Extra read-only bind mounts, isolate --dir syntax (e.g. "/etc/java-21-openjdk:maybe"). */
  dirs?: string[];
}

export type RunStatus = "OK" | "RE" | "SG" | "TO" | "XX";

export interface RunMeta {
  status: RunStatus;
  exitCode: number | null;
  exitSignal: number | null;
  timeMs: number;
  wallMs: number;
  /** Peak memory of the box's cgroup (KB), falling back to max RSS. */
  memoryKb: number;
  oomKilled: boolean;
  killed: boolean;
  message: string;
}

export interface Box {
  readonly id: number;
  /** Host path of the box's working directory (/box inside the sandbox). */
  readonly dir: string;
  init(): Promise<void>;
  cleanup(): Promise<void>;
  run(spec: RunSpec): Promise<RunMeta>;
}

export interface Sandbox {
  readonly name: string;
  box(id: number): Box;
  /** Throws if the sandbox is unusable (called at startup). */
  selfCheck(): Promise<void>;
}
