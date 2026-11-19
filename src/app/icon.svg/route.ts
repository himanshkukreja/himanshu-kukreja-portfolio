import { iconResponse } from "@/lib/site/iconResponse";

// icon.svg: himanshukukreja.in's own icon, served as a route (not the metadata file convention) so no icon <link> is added to every
// page: each page's head carries its course's set (src/components/site/CourseHeadIcons.tsx). The course host rewrites this path to its own mark.
export const dynamic = "force-static";

const B64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiIgc2hhcGUtcmVuZGVyaW5nPSJjcmlzcEVkZ2VzIj4KICA8cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiMwMDAiLz4KICA8ZyBmaWxsPSIjRjNGMkVFIj4KICAgIDxyZWN0IHg9IjIiIHk9IjMiIHdpZHRoPSIyIiBoZWlnaHQ9IjEwIi8+CiAgICA8cmVjdCB4PSI0IiB5PSI2IiB3aWR0aD0iMyIgaGVpZ2h0PSIyIi8+CiAgICA8cmVjdCB4PSI2IiB5PSI3IiB3aWR0aD0iMiIgaGVpZ2h0PSI2Ii8+CiAgPC9nPgogIDxyZWN0IHg9IjEwIiB5PSI2IiB3aWR0aD0iNCIgaGVpZ2h0PSI3IiBmaWxsPSIjRkY2QjJCIi8+Cjwvc3ZnPgo=";

export function GET() {
  return iconResponse(B64, "image/svg+xml");
}
