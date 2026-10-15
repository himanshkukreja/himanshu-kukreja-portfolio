import { NextRequest, NextResponse } from "next/server";

/** The old analytics dashboard moved to /admin/traffic (real HTTP redirect, query kept). */
export function GET(req: NextRequest) {
  const url = new URL("/admin/traffic", req.url);
  url.search = req.nextUrl.search;
  return NextResponse.redirect(url, 308);
}
