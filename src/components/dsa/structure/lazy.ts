/** A visual lesson's on-demand chunks (one import() per module, so saving offline can fetch the same chunks). */
export const loadStructureSandbox = () => import("./Sandbox");
export const loadStackSandbox = () => import("./StackSandbox");
export const loadStructureLab = () => import("./StructureLab");
export const loadVizDemo = () => import("./VizDemo");
export const loadGridVisualizer = () => import("../algorithm/GridVisualizer");
export const loadGraphVisualizer = () => import("../algorithm/GraphVisualizer");
export const loadIntervalsVisualizer = () => import("../algorithm/IntervalsVisualizer");
export const loadDpVisualizer = () => import("../algorithm/DpVisualizer");
export const loadFunctionLab = () => import("../algorithm/FunctionLab");
export const loadQueueSandbox = () => import("./QueueSandbox");
export const loadTreeSandbox = () => import("./TreeSandbox");
export const loadHeapSandbox = () => import("./HeapSandbox");
export const loadTrieSandbox = () => import("./TrieSandbox");
export const loadGraphSandbox = () => import("./GraphSandbox");
