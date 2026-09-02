"use client";

import { useMemo, useState } from "react";
import { useRequireRole } from "@/hooks/use-require-role";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppointmentCalendar } from "@/components/appointments/appointment-calendar";
import { QueueBoard } from "@/components/appointments/queue-board";
import { AIPrioritizationBanner } from "@/components/appointments/ai-prioritization-banner";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import type { AppointmentItem } from "@/lib/types/appointment";
import type { QueueItem } from "@/components/appointments/queue-board";
import type { AppointmentConflict } from "@/lib/data/appointments";
import {
  PlusIcon,
  AlertTriangleIcon,
  FilterIcon,
  CalendarClockIcon,
  UsersIcon,
  ListChecksIcon,
} from "lucide-react";

interface AppointmentsPageClientProps {
  appointments: AppointmentItem[];
  queue: QueueItem[];
  conflicts: AppointmentConflict[];
  patients: Array<{ id: string; name: string; patient_code: string }>;
  staff: Array<{ id: string; name: string }>;
  currentStaffId: string | null;
  highlightId: string | null;
}

function LoadingState() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div
        className="flex size-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-[#002444]">{value}</p>
      </div>
    </div>
  );
}

export function AppointmentsPageClient({
  appointments,
  queue,
  conflicts,
  patients,
  staff,
  currentStaffId,
  highlightId,
}: AppointmentsPageClientProps) {
  const { role, isLoading, isAllowed } = useRequireRole([
    "doctor",
    "nurse",
    "admin",
  ]);
  const [formOpen, setFormOpen] = useState(false);
  const [formStart, setFormStart] = useState<Date | undefined>();
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      upcoming: appointments.length,
      today: appointments.filter(
        (a) => new Date(a.start_time).toDateString() === today,
      ).length,
      conflicts: conflicts.length,
      inQueue: queue.filter((q) => q.status === "waiting").length,
    };
  }, [appointments, conflicts, queue]);

  if (isLoading || role === null) {
    return <LoadingState />;
  }

  if (!isAllowed) {
    return null;
  }

  // Doctor: personal schedule + export (ProjectPlan). Nurse/Admin: ops tabs.
  const isPersonalView = role === "doctor";
  const filteredStaff =
    staffFilter === "all"
      ? staff
      : staff.filter((member) => member.id === staffFilter);

  const calendarStaffFilter = isPersonalView
    ? currentStaffId
    : staffFilter === "all"
      ? null
      : staffFilter;

  function openCreateForm(start?: Date) {
    setFormStart(start);
    setFormOpen(true);
  }

  function exportScheduleCsv() {
    const header = [
      "Start",
      "End",
      "Patient",
      "Visit type",
      "Status",
      "Room",
    ];
    const rows = appointments.map((a) => [
      a.start_time,
      a.end_time,
      a.patient_name,
      a.visit_type,
      a.status,
      a.room ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `medisync-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (isPersonalView) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#002444]">My Schedule</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your appointments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-sm font-semibold"
              onClick={exportScheduleCsv}
              disabled={appointments.length === 0}
            >
              Export schedule
            </Button>
            <Button
              size="sm"
              className="text-sm font-semibold"
              style={{ backgroundColor: "#0062a1", color: "#fff" }}
              onClick={() => openCreateForm()}
            >
              <PlusIcon className="size-4 mr-1" />
              New appointment
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<CalendarClockIcon className="size-5" />}
            label="Today"
            value={stats.today}
            accent="#0062a1"
          />
          <StatCard
            icon={<ListChecksIcon className="size-5" />}
            label="Upcoming"
            value={stats.upcoming}
            accent="#0a8a5f"
          />
          <StatCard
            icon={<UsersIcon className="size-5" />}
            label="In queue"
            value={stats.inQueue}
            accent="#BA7517"
          />
        </div>

        <AppointmentCalendar
          initialAppointments={appointments}
          staffIdFilter={currentStaffId}
          editable
          highlightId={highlightId}
          onCreateRequest={(start) => openCreateForm(start)}
        />

        <AppointmentForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          patients={patients}
          staff={
            currentStaffId
              ? staff.filter((member) => member.id === currentStaffId)
              : staff
          }
          defaultStaffId={currentStaffId ?? undefined}
          defaultStart={formStart}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#002444]">
            Appointment Management
          </h1>
          <Badge
            variant="outline"
            className="border-0 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-[#0062a1]"
          >
            {role === "nurse" ? "Nurse View" : "Admin View"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger size="sm" className="w-52 bg-white">
              <FilterIcon className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Filter by staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="text-sm font-semibold"
            style={{ backgroundColor: "#BA7517", color: "#fff" }}
            onClick={() => openCreateForm()}
          >
            <PlusIcon className="size-4 mr-1" />
            New appointment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<CalendarClockIcon className="size-5" />}
          label="Today"
          value={stats.today}
          accent="#0062a1"
        />
        <StatCard
          icon={<ListChecksIcon className="size-5" />}
          label="Upcoming"
          value={stats.upcoming}
          accent="#0a8a5f"
        />
        <StatCard
          icon={<AlertTriangleIcon className="size-5" />}
          label="Conflicts"
          value={stats.conflicts}
          accent="#dc2626"
        />
        <StatCard
          icon={<UsersIcon className="size-5" />}
          label="In queue"
          value={stats.inQueue}
          accent="#BA7517"
        />
      </div>

      <Tabs defaultValue="staff-calendar">
        <TabsList variant="line">
          <TabsTrigger value="staff-calendar">Staff calendar</TabsTrigger>
          <TabsTrigger value="queue">Queue management</TabsTrigger>
          <TabsTrigger value="conflicts">
            Conflicts
            {conflicts.length > 0 && (
              <Badge
                variant="outline"
                className="ml-1 border-0 text-[10px] bg-red-50 text-red-600"
              >
                {conflicts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff-calendar" className="mt-4 flex flex-col gap-4">
          {staffFilter !== "all" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FilterIcon className="size-3.5" />
              Filtering by{" "}
              <span className="font-semibold text-[#002444]">
                {staff.find((m) => m.id === staffFilter)?.name}
              </span>
              <button
                type="button"
                onClick={() => setStaffFilter("all")}
                className="ml-1 font-medium text-[#0062a1] hover:underline"
              >
                Clear
              </button>
            </div>
          )}

          <AppointmentCalendar
            initialAppointments={appointments}
            staffIdFilter={calendarStaffFilter}
            editable
            highlightId={highlightId}
            onCreateRequest={(start) => openCreateForm(start)}
          />
        </TabsContent>

        <TabsContent value="queue" className="mt-4 flex flex-col gap-4">
          <AIPrioritizationBanner waitingCount={stats.inQueue} />
          <QueueBoard queue={queue} />
        </TabsContent>

        <TabsContent value="conflicts" className="mt-4">
          <ConflictsList conflicts={conflicts} />
        </TabsContent>
      </Tabs>

      <AppointmentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        patients={patients}
        staff={filteredStaff.length > 0 ? filteredStaff : staff}
        defaultStaffId={
          staffFilter !== "all" ? staffFilter : currentStaffId ?? undefined
        }
        defaultStart={formStart}
      />
    </div>
  );
}

function ConflictsList({ conflicts }: { conflicts: AppointmentConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-xl bg-white px-6 py-12 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">
          No conflicts detected
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {conflicts.map((conflict) => (
        <div
          key={conflict.id}
          className="flex items-start gap-4 rounded-xl bg-white px-5 py-4 shadow-sm border-l-4 border-l-red-500"
        >
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-semibold">{conflict.staff_name}</p>
            <p className="text-xs text-muted-foreground">{conflict.time_range}</p>
            <p className="mt-1 text-xs">
              <span className="font-medium">Patients: </span>
              {conflict.patients.join(", ")}
              {conflict.room && (
                <span className="ml-2 text-muted-foreground">
                  · {conflict.room}
                </span>
              )}
            </p>
          </div>
          <Badge
            variant="outline"
            className="ml-auto shrink-0 border-0 text-xs bg-red-50 text-red-600"
          >
            CONFLICT
          </Badge>
        </div>
      ))}
    </div>
  );
}
