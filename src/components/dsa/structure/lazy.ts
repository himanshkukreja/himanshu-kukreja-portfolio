/** A structure lesson's on-demand chunks (one import() per module, so saving offline can fetch the same chunks). */
export const loadStructureSandbox = () => import("./Sandbox");
export const loadStructureLab = () => import("./StructureLab");
export const loadVizDemo = () => import("./VizDemo");
