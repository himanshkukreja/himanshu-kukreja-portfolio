import { Section } from "@/components/Sections";
import AdminPanel from "@/components/AdminPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  return (
    <main className="pt-6">
      <Section id="admin" title="Newsletter Admin">
        <AdminPanel />
      </Section>
    </main>
  );
}
