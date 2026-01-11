"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Eye,
  Clock,
  TrendingUp,
  Monitor,
  Smartphone,
  Globe,
  ExternalLink,
} from "lucide-react";

type TimeRange = "7d" | "30d" | "90d" | "all";

type AnalyticsData = {
  overview: {
    totalVisits: number;
    uniqueVisitors: number;
    uniqueSessions: number;
    avgSessionDuration: number;
  };
  visitsTimeline: Array<{
    date: string;
    visits: number;
    unique_visitors: number;
  }>;
  topPages: Array<{
    path: string;
    title: string;
    visits: number;
    unique_visitors: number;
  }>;
  topReferrers: Array<{
    source: string;
    visits: number;
    unique_visitors: number;
  }>;
  deviceBreakdown: Array<{
    device: string;
    count: number;
    percentage: number;
  }>;
  browserBreakdown: Array<{
    browser: string;
    count: number;
    percentage: number;
  }>;
  osBreakdown: Array<{
    os: string;
    count: number;
    percentage: number;
  }>;
  geoBreakdown: Array<{
    country: string;
    visits: number;
    percentage: number;
    cities: string[];
  }>;
  topCities: Array<{
    city: string;
    visits: number;
    percentage: number;
  }>;
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      // Get the analytics admin token from environment variable (exposed as public for client-side)
      const token = process.env.NEXT_PUBLIC_ANALYTICS_ADMIN_TOKEN;

      const response = await fetch(`/api/admin/analytics?range=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const result = await response.json();

      // Validate the response has the expected structure
      if (result.error || !result.overview) {
        throw new Error(result.error || "Invalid response format");
      }

      setData(result);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      setData(null); // Ensure data is set to null on error
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data || !data.overview) {
    return (
      <div className="text-center py-12">
        <div className="text-white/60 mb-4">
          ⚠️ Unable to load analytics data
        </div>
        <div className="text-white/40 text-sm max-w-md mx-auto">
          This is expected in localhost. The analytics system is fully set up and will work in production when deployed to Vercel.
          <br /><br />
          <strong>Reasons for localhost issues:</strong>
          <ul className="text-left mt-2 space-y-1">
            <li>• Supabase connection may be blocked in development</li>
            <li>• Edge runtime features only work in production</li>
            <li>• RLS policies may need additional configuration</li>
          </ul>
          <br />
          <strong className="text-blue-400">Deploy to Vercel to see analytics working!</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Analytics Dashboard</h2>
        <div className="flex gap-2">
          {[
            { label: "Last 7 days", value: "7d" as TimeRange },
            { label: "Last 30 days", value: "30d" as TimeRange },
            { label: "Last 90 days", value: "90d" as TimeRange },
            { label: "All time", value: "all" as TimeRange },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRange === option.value
                  ? "bg-blue-500 text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Eye className="w-6 h-6" />}
          label="Total Visits"
          value={data.overview.totalVisits.toLocaleString()}
          color="blue"
        />
        <MetricCard
          icon={<Users className="w-6 h-6" />}
          label="Unique Visitors"
          value={data.overview.uniqueVisitors.toLocaleString()}
          color="green"
        />
        <MetricCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Sessions"
          value={data.overview.uniqueSessions.toLocaleString()}
          color="purple"
        />
        <MetricCard
          icon={<Clock className="w-6 h-6" />}
          label="Avg. Duration"
          value={`${data.overview.avgSessionDuration}s`}
          color="yellow"
        />
      </div>

      {/* Visits Timeline Chart */}
      <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Visits Over Time</h3>
        <div className="h-64">
          <SimpleLineChart data={data.visitsTimeline} />
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Pages</h3>
          <div className="space-y-3">
            {data.topPages.map((page, index) => (
              <div key={page.path} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{page.title}</div>
                  <div className="text-white/40 text-sm truncate">{page.path}</div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-white font-semibold">{page.visits}</div>
                  <div className="text-white/40 text-sm">{page.unique_visitors} unique</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Referrers */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ExternalLink className="w-5 h-5" />
            Top Referrers
          </h3>
          <div className="space-y-3">
            {data.topReferrers.map((referrer) => (
              <div key={referrer.source} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{referrer.source}</div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-white font-semibold">{referrer.visits}</div>
                  <div className="text-white/40 text-sm">{referrer.unique_visitors} unique</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device & Browser Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Breakdown */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            Devices
          </h3>
          <div className="space-y-3">
            {data.deviceBreakdown.map((device) => (
              <div key={device.device}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white capitalize">{device.device}</span>
                  <span className="text-white/60">{device.percentage}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${device.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Browser Breakdown */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Browsers
          </h3>
          <div className="space-y-3">
            {data.browserBreakdown.map((browser) => (
              <div key={browser.browser}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white">{browser.browser}</span>
                  <span className="text-white/60">{browser.percentage}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${browser.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OS Breakdown */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Operating Systems
          </h3>
          <div className="space-y-3">
            {data.osBreakdown.map((os) => (
              <div key={os.os}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white">{os.os}</span>
                  <span className="text-white/60">{os.percentage}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${os.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Geographic Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Countries */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Top Countries
          </h3>
          <div className="space-y-3">
            {data.geoBreakdown.map((geo) => (
              <div key={geo.country}>
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1">
                    <div className="text-white font-medium">{geo.country}</div>
                    {geo.cities.length > 0 && (
                      <div className="text-white/40 text-xs mt-0.5">
                        Cities: {geo.cities.slice(0, 3).join(", ")}
                        {geo.cities.length > 3 && ` +${geo.cities.length - 3} more`}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-white font-semibold">{geo.visits}</div>
                    <div className="text-white/40 text-sm">{geo.percentage}%</div>
                  </div>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all"
                    style={{ width: `${geo.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Cities */}
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Top Cities
          </h3>
          <div className="space-y-3">
            {data.topCities.map((cityData) => (
              <div key={cityData.city} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{cityData.city}</div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-white font-semibold">{cityData.visits}</div>
                  <div className="text-white/40 text-sm">{cityData.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "blue" | "green" | "purple" | "yellow";
}) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    yellow: "text-yellow-400",
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-6">
      <div className={`${colorClasses[color]} mb-2`}>{icon}</div>
      <div className="text-white/60 text-sm mb-1">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

function SimpleLineChart({
  data,
}: {
  data: Array<{ date: string; visits: number; unique_visitors: number }>;
}) {
  if (!data.length) {
    return <div className="text-white/40 text-center py-12">No data available</div>;
  }

  const maxVisits = Math.max(...data.map((d) => d.visits));
  const height = 200;

  return (
    <div className="relative h-full">
      <div className="flex items-end justify-between h-full gap-1">
        {data.map((point, index) => {
          const barHeight = (point.visits / maxVisits) * height;
          return (
            <div
              key={point.date}
              className="flex-1 flex flex-col items-center group"
            >
              <div className="relative w-full">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    <div className="font-semibold">{point.date}</div>
                    <div>Visits: {point.visits}</div>
                    <div>Unique: {point.unique_visitors}</div>
                  </div>
                </div>
                {/* Bar */}
                <div
                  className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-400"
                  style={{ height: `${barHeight}px` }}
                />
              </div>
              {/* Date label (show every 5th) */}
              {index % Math.ceil(data.length / 7) === 0 && (
                <div className="text-white/40 text-xs mt-2 rotate-45 origin-top-left">
                  {new Date(point.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
