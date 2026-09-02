"use client";

import { useState } from "react";
import { useRequireRole } from "@/hooks/use-require-role";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { StaffTable, type StaffMember } from "@/components/staff/staff-table";
import { ShiftMatrix, type ShiftEntry } from "@/components/staff/shift-matrix";
import { ShiftOptimizationPanel } from "@/components/staff/shift-optimization-panel";
import {
  AttendanceTable,
  type AttendanceRecord,
} from "@/components/staff/attendance-table";
import {
  PayrollTable,
  type PayrollRecord,
} from "@/components/staff/payroll-table";

interface StaffPageClientProps {
  staff: StaffMember[];
  shifts: ShiftEntry[];
  attendance: AttendanceRecord[];
  payroll: PayrollRecord[];
  summary: {
    totalStaff: number;
    activeStaff: number;
    onLeave: number;
    conflictCount: number;
  };
}

export function StaffPageClient({
  staff,
  shifts,
  attendance,
  payroll,
  summary,
}: StaffPageClientProps) {
  const { role, isLoading, isAllowed } = useRequireRole(["admin"]);
  const now = new Date();

  const [searchQuery, setSearchQuery] = useState("");
  const [attendanceDate, setAttendanceDate] = useState("");
  const [payMonth, setPayMonth] = useState(String(now.getMonth() + 1));
  const [payYear, setPayYear] = useState(String(now.getFullYear()));
  const [optimizationOpen, setOptimizationOpen] = useState(false);

  if (isLoading || role === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-8 rounded-full border-4 border-gray-200 border-t-[#0062a1] animate-spin" />
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  const filteredStaff = staff.filter((member) => {
    const query = searchQuery.toLowerCase();
    return (
      member.full_name.toLowerCase().includes(query) ||
      member.staff_code.toLowerCase().includes(query) ||
      (member.department ?? "").toLowerCase().includes(query)
    );
  });

  const filteredAttendance = attendanceDate
    ? attendance.filter((record) => record.attendance_date === attendanceDate)
    : attendance;

  const filteredPayroll = payroll.filter(
    (record) =>
      record.pay_month === Number(payMonth) &&
      record.pay_year === Number(payYear)
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#002444" }}>
          Staff Management
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div
          className="rounded-xl bg-white shadow-sm p-4 border-l-4"
          style={{ borderLeftColor: "#002444" }}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Total Staff
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#002444" }}>
            {summary.totalStaff}
          </p>
        </div>
        <div
          className="rounded-xl bg-white shadow-sm p-4 border-l-4"
          style={{ borderLeftColor: "#639922" }}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#639922" }}>
            {summary.activeStaff}
          </p>
        </div>
        <div
          className="rounded-xl bg-white shadow-sm p-4 border-l-4"
          style={{ borderLeftColor: "#BA7517" }}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            On Leave Today
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#BA7517" }}>
            {summary.onLeave}
          </p>
        </div>
        <div
          className="rounded-xl bg-white shadow-sm p-4 border-l-4"
          style={{ borderLeftColor: "#E24B4A" }}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Shift Conflicts
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#E24B4A" }}>
            {summary.conflictCount}
          </p>
        </div>
      </div>

      <Tabs defaultValue="all-staff">
        <TabsList
          variant="line"
          className="border-b border-gray-200 rounded-none w-full justify-start pb-0 h-auto gap-0"
        >
          <TabsTrigger value="all-staff" className="px-4 pb-2">
            All Staff
          </TabsTrigger>
          <TabsTrigger value="shifts" className="px-4 pb-2">
            Shifts
          </TabsTrigger>
          <TabsTrigger value="attendance" className="px-4 pb-2">
            Attendance
          </TabsTrigger>
          <TabsTrigger value="payroll" className="px-4 pb-2">
            Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all-staff" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search staff ID, name, department..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="max-w-sm"
            />
          </div>
          <StaffTable staff={filteredStaff} />
        </TabsContent>

        <TabsContent value="shifts" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <Button
              className="flex items-center gap-2 font-semibold"
              style={{ backgroundColor: "#1a007d", color: "#fff" }}
              onClick={() => setOptimizationOpen(true)}
            >
              <Sparkles className="size-4" />
              AI Optimize Shifts
            </Button>
          </div>
          <ShiftMatrix shifts={shifts} />
          <ShiftOptimizationPanel
            open={optimizationOpen}
            onClose={() => setOptimizationOpen(false)}
            shifts={shifts}
          />
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="attendance-date"
                className="text-xs font-medium text-gray-500"
              >
                Filter by date
              </label>
              <input
                id="attendance-date"
                type="date"
                value={attendanceDate}
                onChange={(event) => setAttendanceDate(event.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0062a1]/30"
              />
            </div>
            {attendanceDate && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setAttendanceDate("")}
              >
                Clear
              </Button>
            )}
          </div>
          <AttendanceTable records={filteredAttendance} />
        </TabsContent>

        <TabsContent value="payroll" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="pay-month" className="text-xs font-medium text-gray-500">
                Month
              </label>
              <select
                id="pay-month"
                value={payMonth}
                onChange={(event) => setPayMonth(event.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0062a1]/30"
              >
                {[
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ].map((month, index) => (
                  <option key={month} value={String(index + 1)}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pay-year" className="text-xs font-medium text-gray-500">
                Year
              </label>
              <select
                id="pay-year"
                value={payYear}
                onChange={(event) => setPayYear(event.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0062a1]/30"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
                  (year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
          <PayrollTable records={filteredPayroll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
