import {
  getStaffSummary,
  listAttendanceRecords,
  listPayrollRecords,
  listShiftSchedules,
  listStaff,
} from "@/lib/data/staff";
import { StaffPageClient } from "./staff-page-client";

export default async function StaffPage() {
  const [staff, shifts, attendance, payroll] = await Promise.all([
    listStaff(),
    listShiftSchedules(),
    listAttendanceRecords(),
    listPayrollRecords(),
  ]);

  const summary = await getStaffSummary(staff, attendance, shifts);

  return (
    <StaffPageClient
      staff={staff}
      shifts={shifts}
      attendance={attendance}
      payroll={payroll}
      summary={summary}
    />
  );
}
