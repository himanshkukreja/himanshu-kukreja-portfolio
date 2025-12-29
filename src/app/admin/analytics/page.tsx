import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Analytics | Admin",
  description: "Portfolio analytics dashboard",
};

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-7xl mx-auto">
        <AnalyticsDashboard />
      </div>
    </main>
  );
}
