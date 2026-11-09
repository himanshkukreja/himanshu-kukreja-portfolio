// next/cache outside Next (scripts/listen loads the site's modules through jiti): no data cache here, so a cached
// loader just runs. The DSA concept loader reaches SD Mastery's course map and labs through unstable_cache.
export const unstable_cache = (fn) => fn;
export const revalidateTag = () => {};
export const revalidatePath = () => {};
export const unstable_noStore = () => {};
