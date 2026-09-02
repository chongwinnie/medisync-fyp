import { notFound } from "next/navigation";
import { getPatient } from "@/lib/data/patients";
import { listStaff } from "@/lib/data/staff";
import { PatientDetailView } from "./patient-detail-view";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [patient, staff] = await Promise.all([getPatient(id), listStaff()]);

  if (!patient) {
    notFound();
  }

  const doctors = staff
    .filter((member) => member.role === "doctor")
    .map((member) => ({ id: member.id, name: member.full_name }));

  return <PatientDetailView patient={patient} doctors={doctors} />;
}
