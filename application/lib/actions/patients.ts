"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

export interface CreatePatientInput {
  patientCode: string;
  fullName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other" | "unknown";
  bloodType?: string;
  phone?: string;
  primaryDoctorId?: string;
  /** When true, create as admitted (New Admission flow). */
  asAdmission?: boolean;
}

export interface UpdatePatientInput {
  id: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other" | "unknown";
  bloodType?: string;
  phone?: string;
  primaryDoctorId?: string;
  status?: "outpatient" | "admitted" | "discharged" | "inactive";
}

async function requireUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Unauthorized");
  return currentUser;
}

export async function createPatientAction(
  input: CreatePatientInput
): Promise<{ success: boolean; error?: string; id?: string }> {
  const currentUser = await requireUser();
  // Admission / create-patient: doctor, nurse, and admin (ProjectPlan New Admission).
  if (
    currentUser.role !== "admin" &&
    currentUser.role !== "doctor" &&
    currentUser.role !== "nurse"
  ) {
    return { success: false, error: "Insufficient permissions" };
  }

  const asAdmission = Boolean(input.asAdmission);
  const now = new Date().toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      patient_code: input.patientCode,
      full_name: input.fullName,
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      blood_type: input.bloodType ?? null,
      phone: input.phone ?? null,
      primary_doctor_id: input.primaryDoctorId ?? null,
      status: asAdmission ? "admitted" : "outpatient",
      admitted_at: asAdmission ? now : null,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/patients");
  return { success: true, id: data.id };
}

export async function listDoctorOptionsAction(): Promise<
  Array<{ id: string; name: string }>
> {
  await requireUser();
  const { listStaff } = await import("@/lib/data/staff");
  const staff = await listStaff();
  return staff
    .filter((member) => member.role === "doctor")
    .map((member) => ({ id: member.id, name: member.full_name }));
}

export async function updatePatientAction(
  input: UpdatePatientInput
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin" && currentUser.role !== "doctor") {
    return { success: false, error: "Insufficient permissions" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      ...(input.fullName ? { full_name: input.fullName } : {}),
      ...(input.dateOfBirth ? { date_of_birth: input.dateOfBirth } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.bloodType !== undefined ? { blood_type: input.bloodType } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.primaryDoctorId !== undefined
        ? { primary_doctor_id: input.primaryDoctorId }
        : {}),
      ...(input.status ? { status: input.status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/patients");
  revalidatePath(`/patients/${input.id}`);
  return { success: true };
}

export async function dischargePatientAction(
  patientId: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin" && currentUser.role !== "doctor") {
    return { success: false, error: "Insufficient permissions" };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: patientError } = await supabase
    .from("patients")
    .update({
      status: "discharged",
      discharged_at: now,
      updated_at: now,
    })
    .eq("id", patientId);

  if (patientError) {
    return { success: false, error: patientError.message };
  }

  await supabase
    .from("bed_allocations")
    .update({ is_active: false, updated_at: now })
    .eq("patient_id", patientId)
    .eq("is_active", true);

  revalidatePath("/patients");
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/inventory");
  return { success: true };
}

export async function createConsultationAction(
  patientId: string,
  chiefComplaint: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.from("case_history").insert({
    patient_id: patientId,
    staff_id: currentUser.staffId,
    visit_type: "consultation",
    chief_complaint: chiefComplaint,
    clinical_notes: "",
    assessment: "",
    plan: "",
    visit_date: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/patients/${patientId}`);
  return { success: true };
}

export async function fetchPatientCard(patientId: string) {
  const { getPatientCard } = await import("@/lib/data/patients");
  return getPatientCard(patientId);
}
