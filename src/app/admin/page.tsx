"use client";

import { useState } from "react";
import { Section } from "@/components/Sections";
import AdminPanel from "@/components/AdminPanel";
import UserAdmin from "@/components/UserAdmin";
import { Mail, Users, ChevronRight } from "lucide-react";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"newsletter" | "users">("users");

  return (
    <main className="pt-6">
      {/* Tab Navigation */}
      <div className="mb-6 border-b border-black/10 dark:border-white/10">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all relative ${
              activeTab === "users"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Users className="w-5 h-5" />
            User Management
            {activeTab === "users" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
          
          <button
            onClick={() => setActiveTab("newsletter")}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all relative ${
              activeTab === "newsletter"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Mail className="w-5 h-5" />
            Newsletter Management
            {activeTab === "newsletter" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "users" && (
        <Section id="user-admin" title="User Management">
          <UserAdmin />
        </Section>
      )}

      {activeTab === "newsletter" && (
        <Section id="newsletter-admin" title="Newsletter Admin">
          <AdminPanel />
        </Section>
      )}
    </main>
  );
}
