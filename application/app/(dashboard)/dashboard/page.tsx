import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ScheduleTable } from "@/components/dashboard/schedule-table";
import { RecentActivityFeed } from "@/components/dashboard/recent-activity-feed";
import { AiQuickWidget } from "@/components/dashboard/ai-quick-widget";
import {
  getDashboardKpis,
  getRecentActivity,
  getTodaySchedule,
} from "@/lib/data/dashboard";
import { getCurrentUser } from "@/lib/auth/current-user";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function displayName(
  name: string | undefined,
  role: "doctor" | "nurse" | "admin",
  email: string
): string {
  if (name?.trim()) {
    const first = name.trim().split(/\s+/)[0];
    if (role === "doctor" && !/^dr\.?/i.test(first)) {
      return `Dr. ${first}`;
    }
    return first;
  }
  const local = email.split("@")[0] || "there";
  return role === "doctor" ? `Dr. ${local}` : local;
}

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  const role = currentUser?.role ?? "doctor";
  const greeting = getGreeting();
  const currentDate = formatDate();
  const who = displayName(
    currentUser?.name,
    role,
    currentUser?.email ?? ""
  );

  const [kpis, schedule, activity] = await Promise.all([
    getDashboardKpis(role),
    getTodaySchedule(),
    getRecentActivity(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002444]">
            {greeting}, {who}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{currentDate}</p>
        </div>
        <Link
          href="/appointments"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-[#002444] shadow-sm transition-colors hover:bg-gray-50"
        >
          <CalendarCheck size={16} className="text-[#0062a1]" />
          View Full Calendar
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            change={kpi.change}
            icon={kpi.icon}
            color={kpi.color}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#002444]">
              Today&apos;s Schedule
            </h2>
            <button className="text-xs font-medium text-[#0062a1] hover:underline">
              Filter
            </button>
          </div>
          <ScheduleTable items={schedule} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-base font-semibold text-[#002444] mb-4">
              Recent Activity
            </h2>
            <RecentActivityFeed items={activity} />
          </div>

          <AiQuickWidget />
        </div>
      </div>
    </div>
  );
}
