// eval stand-in for next/cache outside Next: unstable_cache runs the function, tags and paths are no-ops
export const unstable_cache = <T extends (...a: never[]) => unknown>(fn: T) => fn;
export const revalidateTag = () => {};
export const revalidatePath = () => {};
export const unstable_noStore = () => {};
