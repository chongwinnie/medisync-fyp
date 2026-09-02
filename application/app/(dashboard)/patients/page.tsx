import { getCurrentUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/data/patients";
import { listStaff } from "@/lib/data/staff";
import { PatientsPageClient } from "./patients-page-client";

export default async function PatientsPage() {
  const [patients, staff, currentUser] = await Promise.all([
    listPatients(),
    listStaff(),
    getCurrentUser(),
  ]);

  const doctors = staff
    .filter((member) => member.role === "doctor")
    .map((member) => ({ id: member.id, name: member.full_name }));

  return (
    <PatientsPageClient
      patients={patients}
      doctors={doctors}
      currentStaffId={currentUser?.staffId ?? null}
    />
  );
}
