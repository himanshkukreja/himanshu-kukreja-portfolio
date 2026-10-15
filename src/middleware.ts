import { NextResponse, type NextRequest } from "next/server";

/**
 * Dev-only routes (design lab, quiz fixture) must be a hard 404 in production. Their pages also
 * call notFound(), but behind a streamed loading.tsx that still answers HTTP 200.
 */
export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  }
  return NextResponse.next({ request: req });
}

export const config = { matcher: ["/lab/:path*", "/learn/arena/dev/:path*"] };
