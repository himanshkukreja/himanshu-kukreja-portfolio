import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  // TODO: Hook up an email service or store submissions
  console.log("Contact submission:", body);
  return NextResponse.json({ ok: true });
}
