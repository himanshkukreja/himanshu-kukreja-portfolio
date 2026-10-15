import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


/** Quote a CSV cell; neutralise spreadsheet formulas (=, +, -, @) from user-supplied values. */
const cell = (v: unknown) => {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, created_at, city, region, country, timezone, unsubscribed, unsubscribed_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load subscribers" }, { status: 500 });
  }

  // Generate CSV content
  const headers = ["Email", "Subscribed Date", "Status", "City", "Region", "Country", "Timezone", "Unsubscribed Date"];
  const csvRows = [headers.join(",")];

  (data || []).forEach((sub) => {
    const row = [
      sub.email,
      new Date(sub.created_at).toISOString(),
      sub.unsubscribed ? "Unsubscribed" : "Active",
      sub.city,
      sub.region,
      sub.country,
      sub.timezone,
      sub.unsubscribed_at ? new Date(sub.unsubscribed_at).toISOString() : "",
    ].map(cell);
    csvRows.push(row.join(","));
  });

  const csvContent = csvRows.join("\n");
  const filename = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
