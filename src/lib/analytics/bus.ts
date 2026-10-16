/**
 * Tiny dependency-free hand-off between the first-party tracker / router instrumentation and the
 * optional third-party sinks (PostHog, GA4). The sinks register themselves only when they are
 * configured and allowed, so with no config every call here is a no-op.
 *
 *   src/lib/track.ts               → emitProduct(name, props) after its own filtering
 *   src/instrumentation-client.ts  → emitRouteStart(pathname) before a navigation commits
 *   src/lib/analytics/client.ts    → onProduct / onRouteStart
 */
export type ProductProps = Record<string, string | number | boolean>;

type ProductSink = (name: string, props: ProductProps) => void;
type RouteSink = (pathname: string) => void;

// On globalThis so the instrumentation-client entry and the app bundle share one registry even if
// the bundler ever gives them separate module instances.
type Registry = { product: Set<ProductSink>; route: Set<RouteSink> };
const g = globalThis as typeof globalThis & { __hkAnalyticsBus?: Registry };
const reg: Registry = (g.__hkAnalyticsBus ??= { product: new Set(), route: new Set() });
const { product, route } = reg;

export function onProduct(fn: ProductSink): () => void {
  product.add(fn);
  return () => product.delete(fn);
}

export function onRouteStart(fn: RouteSink): () => void {
  route.add(fn);
  return () => route.delete(fn);
}

export function emitProduct(name: string, props: ProductProps) {
  for (const fn of product) {
    try {
      fn(name, props);
    } catch {
      /* a sink must never break the caller */
    }
  }
}

export function emitRouteStart(pathname: string) {
  for (const fn of route) {
    try {
      fn(pathname);
    } catch {
      /* never break navigation */
    }
  }
}
