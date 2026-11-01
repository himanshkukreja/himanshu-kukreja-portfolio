import { NextResponse } from "next/server";
import { requireAdmin, requireOwner } from "@/lib/admin/auth";
import { addAdmin, addedAdmins, normEmail, ownerEmails, recentAudit, removeAdmin } from "@/lib/admin/admins";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Which of these emails have a site account (an added admin signs in with an account on that email). */
async function withAccounts(emails: string[]): Promise<Set<string>> {
  const want = new Set(emails);
  const found = new Set<string>();
  for (let page = 1; page <= 20 && found.size < want.size; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) if (want.has(normEmail(u.email))) found.add(normEmail(u.email));
    if (data.users.length < 1000) break;
  }
  return found;
}

/**
 * GET /api/admin/admins (any admin) → { owners: [{ email, account }], admins: [{ email, added_by, added_at, note,
 * account }], table (admin_users exists), canManage (the caller is an owner), you, audit: [...] | null }.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const [{ rows, table }, audit] = await Promise.all([addedAdmins(true), recentAudit(30)]);
  const owners = ownerEmails();
  const accounts = await withAccounts([...owners, ...rows.map((r) => r.email)]);
  return NextResponse.json(
    {
      owners: owners.map((email) => ({ email, account: accounts.has(email) })),
      admins: rows.map((r) => ({ ...r, account: accounts.has(r.email) })),
      table,
      canManage: admin.owner,
      you: admin.email,
      audit,
    },
    { headers: noStore },
  );
}

/** POST { email, note? } (owner only) → adds an admin. */
export async function POST(request: Request) {
  const owner = await requireOwner(request);
  if (owner instanceof NextResponse) return owner;
  const b = (await request.json().catch(() => ({}))) as { email?: unknown; note?: unknown };
  if (typeof b.email !== "string") return NextResponse.json({ error: "Give an email." }, { status: 400 });
  const r = await addAdmin(owner.email, b.email, typeof b.note === "string" ? b.note : null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

/** DELETE ?email= (owner only) → removes an added admin. Owners can't be removed. */
export async function DELETE(request: Request) {
  const owner = await requireOwner(request);
  if (owner instanceof NextResponse) return owner;
  const email = new URL(request.url).searchParams.get("email") || "";
  if (!email) return NextResponse.json({ error: "Give an email." }, { status: 400 });
  const r = await removeAdmin(owner.email, email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
