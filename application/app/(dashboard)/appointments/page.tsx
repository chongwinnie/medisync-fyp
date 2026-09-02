import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listAppointments,
  listAppointmentConflicts,
  listQueue,
} from "@/lib/data/appointments";
import { listPatientOptions } from "@/lib/data/patients";
import { listStaff } from "@/lib/data/staff";
import { AppointmentsPageClient } from "./appointments-page-client";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const { highlight } = await searchParams;
  // ProjectPlan: doctor = personal schedule; admin/nurse = staff calendar + queue + conflicts.
  // ParallelContracts omits Appointments from nurse nav but does not forbid ops when exposed.
  const isOpsView =
    currentUser.role === "admin" || currentUser.role === "nurse";
  const staffFilter = isOpsView ? null : currentUser.staffId;
  const canListOwn = isOpsView || !!currentUser.staffId;

  const [appointments, queue, conflicts, patients, staff] = await Promise.all([
    canListOwn ? listAppointments(staffFilter) : Promise.resolve([]),
    isOpsView ? listQueue() : Promise.resolve([]),
    isOpsView ? listAppointmentConflicts() : Promise.resolve([]),
    listPatientOptions(),
    listStaff(),
  ]);

  const staffOptions = staff.map((member) => ({
    id: member.id,
    name: member.full_name,
  }));

  return (
    <AppointmentsPageClient
      appointments={appointments}
      queue={queue}
      conflicts={conflicts}
      patients={patients}
      staff={staffOptions}
      currentStaffId={currentUser.staffId}
      highlightId={highlight ?? null}
    />
  );
}
