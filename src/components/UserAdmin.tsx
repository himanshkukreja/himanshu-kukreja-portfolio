"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  TrendingUp,
  Clock,
  Activity,
  Eye,
  Monitor,
  Smartphone,
  Globe,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldX,
} from "lucide-react";
import { formatDistanceToNow, formatLongDate } from "@/lib/date-utils";

type UserActivity = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  email?: string;
  signed_up_at: string;
  last_seen_at: string | null;
  last_sign_in_at: string | null;
  total_lessons_completed: number;
  current_streak: number;
  total_sessions: number;
  total_page_views: number;
  last_activity: string | null;
  unique_pages_visited: number;
  total_comments: number;
};

type UserAnalytics = {
  pageViews: any[];
  sessions: any[];
  deviceBreakdown: { [key: string]: number };
  browserBreakdown: { [key: string]: number };
  topPages: Array<{ path: string; count: number; title: string }>;
  totalPageViews: number;
};

export default function UserAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userAnalytics, setUserAnalytics] = useState<{ [userId: string]: UserAnalytics }>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<{ [userId: string]: boolean }>({});

  useEffect(() => {
    if (authLoading) return; // Wait for auth to load
    
    if (user?.email) {
      fetchUsers();
    } else {
      setLoading(false); // Stop loading if no user
    }
  }, [user, authLoading]);

  const fetchUsers = async () => {
    if (!user?.email) return;

    try {
      setLoading(true);
      const response = await fetch("/api/admin/users", {
        headers: {
          "x-admin-email": user.email,
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized: Admin access required");
        }
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserAnalytics = async (userId: string) => {
    if (userAnalytics[userId] || !user?.email) return; // Already loaded

    try {
      setLoadingAnalytics({ ...loadingAnalytics, [userId]: true });
      const response = await fetch(`/api/admin/user-analytics?userId=${userId}`, {
        headers: {
          "x-admin-email": user.email,
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized: Admin access required");
        }
        throw new Error("Failed to fetch analytics");
      }

      const data = await response.json();
      setUserAnalytics({ ...userAnalytics, [userId]: data });
    } catch (err: any) {
      console.error("Error fetching user analytics:", err);
    } finally {
      setLoadingAnalytics({ ...loadingAnalytics, [userId]: false });
    }
  };

  const toggleUserDetails = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(userId);
      fetchUserAnalytics(userId);
    }
  };

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.last_activity).length,
    avgLessons: users.length > 0 
      ? Math.round(users.reduce((sum, u) => sum + u.total_lessons_completed, 0) / users.length)
      : 0,
    totalPageViews: users.reduce((sum, u) => sum + u.total_page_views, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <ShieldX className="w-16 h-16 text-gray-400" />
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Authentication Required</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Please sign in to access the admin panel
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    const isUnauthorized = error.includes("Unauthorized");
    
    if (isUnauthorized) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-2xl mx-auto">
          <div className="relative">
            <ShieldX className="w-24 h-24 text-red-500" />
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-2xl animate-bounce">
              !
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Whoa There, Speed Racer! 🚫
            </h2>
            <p className="text-xl text-gray-700 dark:text-gray-300">
              You're not authorized to access this page
            </p>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
              Nice try, but this admin panel is reserved for the chosen ones. 
              You know, the people with actual admin privileges? Yeah, not you. 
            </p>
          </div>

          <div className="p-4 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-lg max-w-md">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              💡 <span className="font-semibold">Pro tip:</span> If you think this is a mistake, 
              contact the admin. If you're just being nosy... well, now you know better. 😏
            </p>
          </div>

          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-200 transform hover:scale-105"
          >
            ← Take Me Back to Safety
          </button>
        </div>
      );
    }

    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalUsers}</p>
              <p className="text-sm text-gray-600 dark:text-white/60">Total Users</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeUsers}</p>
              <p className="text-sm text-gray-600 dark:text-white/60">Active Users</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.avgLessons}</p>
              <p className="text-sm text-gray-600 dark:text-white/60">Avg Lessons</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Eye className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.totalPageViews.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 dark:text-white/60">Total Page Views</p>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">User</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Signed Up</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Last Seen</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Lessons</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Streak</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Page Views</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {users.map((user) => (
                <React.Fragment key={user.user_id}>
                  <tr
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <Image
                            src={user.avatar_url}
                            alt={user.full_name}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                            {user.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{user.full_name}</p>
                          <p className="text-xs text-gray-500 dark:text-white/50">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-white/60">
                      {formatDistanceToNow(new Date(user.signed_up_at))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-white/60">
                      {user.last_activity
                        ? formatDistanceToNow(new Date(user.last_activity))
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {user.total_lessons_completed}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-500/20 text-orange-600 dark:text-orange-400">
                        🔥 {user.current_streak}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {user.total_page_views}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleUserDetails(user.user_id)}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                      >
                        {expandedUser === user.user_id ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Details
                          </>
                        )}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {expandedUser === user.user_id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 bg-black/5 dark:bg-white/5">
                        {loadingAnalytics[user.user_id] ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                          </div>
                        ) : userAnalytics[user.user_id] ? (
                          <UserAnalyticsDetails
                            analytics={userAnalytics[user.user_id]}
                            user={user}
                          />
                        ) : null}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Sub-component for detailed analytics
function UserAnalyticsDetails({
  analytics,
  user,
}: {
  analytics: UserAnalytics;
  user: UserActivity;
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Device Usage</h4>
          </div>
          <div className="space-y-1">
            {Object.entries(analytics.deviceBreakdown).map(([device, count]) => (
              <div key={device} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white/60 capitalize">{device}</span>
                <span className="font-medium text-gray-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-green-500" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Browser Usage</h4>
          </div>
          <div className="space-y-1">
            {Object.entries(analytics.browserBreakdown).map(([browser, count]) => (
              <div key={browser} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white/60">{browser}</span>
                <span className="font-medium text-gray-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-purple-500" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Activity</h4>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-white/60">Total Sessions</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {analytics.sessions.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-white/60">Unique Pages</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {user.unique_pages_visited}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-white/60">Comments</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {user.total_comments}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Pages */}
      <div className="p-4 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Most Visited Pages</h4>
        <div className="space-y-2">
          {analytics.topPages.slice(0, 5).map((page, index) => (
            <div
              key={page.path}
              className="flex items-center justify-between p-2 bg-black/5 dark:bg-white/5 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 dark:text-white/50">
                  #{index + 1}
                </span>
                <span className="text-sm text-gray-900 dark:text-white">{page.title}</span>
              </div>
              <span className="text-sm font-medium text-blue-500">{page.count} views</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-4 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Recent Activity</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {analytics.pageViews.slice(0, 20).map((view, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 text-sm border-b border-black/10 dark:border-white/10 last:border-0"
            >
              <div>
                <p className="text-gray-900 dark:text-white">{view.page_title || view.page_path}</p>
                <p className="text-xs text-gray-500 dark:text-white/50">
                  {view.device_type} • {view.browser}
                  {view.city && ` • ${view.city}, ${view.country}`}
                </p>
              </div>
              <span className="text-xs text-gray-500 dark:text-white/50">
                {formatDistanceToNow(new Date(view.created_at))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
