import { createClient } from "@/lib/supabase/server";
import type { PatientRow } from "@/components/patients/patient-table";
import type {
  PatientDetail,
  Condition,
  Medication,
  TreatmentPlanItem,
} from "@/components/patients/patient-header";
import { parseAllergies, firstRelation } from "./utils";

interface EmergencyContactJson {
  name?: string;
  relationship?: string;
  phone?: string;
}

export interface PatientVitalSummary {
  label: string;
  value: string;
  unit: string;
  flag: "normal" | "high" | "low";
}

export interface CaseHistoryEntry {
  id: string;
  date: string;
  event: string;
  note: string;
}

export interface PatientDiagnosticSummary {
  id: string;
  test: string;
  ordered: string;
  status: string;
  summary: string | null;
}

export interface TreatmentPlanSummary {
  id: string;
  title: string;
  objectives?: string;
  aiDraftContent?: string;
  aiConfidence?: number;
  status: string;
}

export interface PatientDetailData extends PatientDetail {
  vitals: PatientVitalSummary[];
  caseHistory: CaseHistoryEntry[];
  diagnostics: PatientDiagnosticSummary[];
  treatmentPlan: TreatmentPlanSummary | null;
}

function mapTreatmentItemStatus(
  status: string
): TreatmentPlanItem["status"] {
  if (status === "done") return "completed";
  if (status === "in_progress" || status === "pending") return status;
  return "pending";
}

function mapReportStatus(status: string): string {
  if (status === "pending_review") return "Pending Review";
  if (status === "finalized") return "Results Available";
  if (status === "draft") return "Draft";
  if (status === "cancelled") return "Cancelled";
  return capitalizeStatus(status);
}

function capitalizeStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapPatientRow(
  row: Record<string, unknown>,
  doctorName?: string | null
): PatientRow {
  return {
    id: row.id as string,
    patient_code: row.patient_code as string,
    full_name: row.full_name as string,
    date_of_birth: row.date_of_birth as string,
    gender: row.gender as PatientRow["gender"],
    status: row.status as PatientRow["status"],
    primary_doctor: doctorName ?? undefined,
    primary_doctor_id: (row.primary_doctor_id as string | null) ?? undefined,
    admitted_at: (row.admitted_at as string | null) ?? undefined,
  };
}

export async function listPatients(): Promise<PatientRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .select(
      `
      id,
      patient_code,
      full_name,
      date_of_birth,
      gender,
      status,
      admitted_at,
      primary_doctor_id,
      primary_doctor:staff!patients_primary_doctor_id_fkey (
        full_name
      )
    `
    )
    .order("full_name");

  if (error) {
    console.error("listPatients:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const doctor = firstRelation(
      row.primary_doctor as { full_name: string } | { full_name: string }[] | null
    );
    return mapPatientRow(row as Record<string, unknown>, doctor?.full_name);
  });
}

export async function listPatientOptions(): Promise<
  Array<{ id: string; name: string; patient_code: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, patient_code")
    .order("full_name");

  if (error) {
    console.error("listPatientOptions:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
    patient_code: row.patient_code,
  }));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPatient(id: string): Promise<PatientDetailData | null> {
  const supabase = await createClient();

  const select = `
      *,
      primary_doctor:staff!patients_primary_doctor_id_fkey (
        full_name
      )
    `;

  // Prefer exact column match: PostgREST `.or()` with hyphens in patient_code
  // (e.g. PT-1042) is fragile and previously caused 404s.
  const query = UUID_RE.test(id)
    ? supabase.from("patients").select(select).eq("id", id)
    : supabase.from("patients").select(select).eq("patient_code", id);

  const { data: patient, error } = await query.maybeSingle();

  if (error || !patient) {
    console.error("getPatient:", error?.message);
    return null;
  }

  return buildPatientDetail(patient, supabase);
}

async function buildPatientDetail(
  patient: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PatientDetailData> {
  const patientId = patient.id as string;
  const doctor = firstRelation(
    patient.primary_doctor as { full_name: string } | { full_name: string }[] | null
  );
  const emergency = patient.emergency_contact as EmergencyContactJson | null;

  const [
    bedAllocationResult,
    conditionsResult,
    medicationsResult,
    treatmentPlansResult,
    vitalsResult,
    caseHistoryResult,
    diagnosticsResult,
  ] = await Promise.all([
    supabase
      .from("bed_allocations")
      .select("rooms(ward, room_number)")
      .eq("patient_id", patientId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("patient_conditions")
      .select("*")
      .eq("patient_id", patientId)
      .order("is_active", { ascending: false }),
    supabase
      .from("medications")
      .select("*")
      .eq("patient_id", patientId)
      .order("start_date", { ascending: false }),
    supabase
      .from("treatment_plans")
      .select("*, treatment_plan_items(*)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("patient_vitals")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false })
      .limit(1),
    supabase
      .from("case_history")
      .select("*")
      .eq("patient_id", patientId)
      .order("visit_date", { ascending: false })
      .limit(10),
    supabase
      .from("diagnostic_reports")
      .select("*")
      .eq("patient_id", patientId)
      .order("report_date", { ascending: false })
      .limit(5),
  ]);

  const conditions: Condition[] = (conditionsResult.data ?? []).map((row) => ({
    id: row.id,
    condition_name: row.condition_name,
    icd_code: row.icd_code ?? undefined,
    severity: (row.severity ?? "mild") as Condition["severity"],
    is_active: row.is_active,
    onset_date: row.onset_date ?? undefined,
  }));

  const medications: Medication[] = (medicationsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      drug_name: row.drug_name,
      dosage: row.dosage,
      frequency: row.frequency,
      route: row.route ?? undefined,
      start_date: row.start_date ?? undefined,
      status: row.status,
    })
  );

  const activePlan = treatmentPlansResult.data?.[0] ?? null;
  const treatmentPlanItems: TreatmentPlanItem[] = (
    activePlan?.treatment_plan_items ?? []
  ).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    intervention: row.intervention as string,
    frequency: (row.frequency as string) ?? "",
    responsible_role: (row.responsible_role as string) ?? "staff",
    status: mapTreatmentItemStatus(row.status as string),
  }));

  const latestVitals = vitalsResult.data?.[0];
  const vitals = buildVitalSummaries(latestVitals);

  const caseHistory: CaseHistoryEntry[] = (caseHistoryResult.data ?? []).map(
    (row) => ({
      id: row.id,
      date: new Date(row.visit_date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      event: row.visit_type
        .split("_")
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      note:
        row.chief_complaint ??
        row.clinical_notes ??
        row.assessment ??
        row.plan ??
        "No notes recorded.",
    })
  );

  const diagnostics: PatientDiagnosticSummary[] = (
    diagnosticsResult.data ?? []
  ).map((row) => ({
    id: row.id,
    test: row.title,
    ordered: new Date(row.report_date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    status: mapReportStatus(row.status),
    summary: row.ai_summary ?? row.findings ?? null,
  }));

  const treatmentPlan: TreatmentPlanSummary | null = activePlan
    ? {
        id: activePlan.id,
        title: activePlan.title,
        objectives: activePlan.objectives ?? undefined,
        aiDraftContent: activePlan.ai_draft_content ?? undefined,
        status: activePlan.status,
      }
    : null;

  const activeBed = firstRelation(
    bedAllocationResult.data?.rooms as
      | { ward: string; room_number: string }
      | { ward: string; room_number: string }[]
      | null
      | undefined
  );

  return {
    id: patientId,
    patient_code: patient.patient_code as string,
    full_name: patient.full_name as string,
    date_of_birth: patient.date_of_birth as string,
    gender: patient.gender as PatientDetail["gender"],
    status: patient.status as PatientDetail["status"],
    blood_type: (patient.blood_type as string | null) ?? undefined,
    ward: activeBed?.ward ?? undefined,
    admitted_at: (patient.admitted_at as string | null) ?? undefined,
    primary_doctor: doctor?.full_name,
    phone: (patient.phone as string | null) ?? undefined,
    emergency_contact:
      emergency?.name && emergency?.relationship && emergency?.phone
        ? {
            name: emergency.name,
            relationship: emergency.relationship,
            phone: emergency.phone,
          }
        : undefined,
    allergies: parseAllergies(patient.allergies as string | null),
    conditions,
    medications,
    treatment_plan_items: treatmentPlanItems,
    vitals,
    caseHistory,
    diagnostics,
    treatmentPlan,
  };
}

function buildVitalSummaries(
  vitals: Record<string, unknown> | undefined
): PatientVitalSummary[] {
  if (!vitals) return [];

  const summaries: PatientVitalSummary[] = [];

  if (vitals.blood_pressure_sys != null && vitals.blood_pressure_dia != null) {
    const sys = Number(vitals.blood_pressure_sys);
    const dia = Number(vitals.blood_pressure_dia);
    summaries.push({
      label: "Blood Pressure",
      value: `${sys}/${dia}`,
      unit: "mmHg",
      flag: sys >= 140 || dia >= 90 ? "high" : "normal",
    });
  }

  if (vitals.heart_rate != null) {
    const hr = Number(vitals.heart_rate);
    summaries.push({
      label: "Heart Rate",
      value: String(hr),
      unit: "bpm",
      flag: hr > 100 ? "high" : "normal",
    });
  }

  if (vitals.o2_saturation != null) {
    summaries.push({
      label: "SpO₂",
      value: String(vitals.o2_saturation),
      unit: "%",
      flag: Number(vitals.o2_saturation) < 95 ? "low" : "normal",
    });
  }

  if (vitals.temperature != null) {
    const temp = Number(vitals.temperature);
    summaries.push({
      label: "Temperature",
      value: String(temp),
      unit: "°C",
      flag: temp >= 38 ? "high" : "normal",
    });
  }

  if (vitals.weight_kg != null) {
    summaries.push({
      label: "Weight",
      value: String(vitals.weight_kg),
      unit: "kg",
      flag: "normal",
    });
  }

  return summaries;
}

export async function getPatientCard(
  patientId: string
): Promise<{
  id: string;
  name: string;
  code: string;
  dob: string;
  sex: string;
  status: string;
} | null> {
  const patient = await getPatient(patientId);
  if (!patient) return null;

  const statusLabel: Record<PatientDetail["status"], string> = {
    admitted: "High Risk",
    outpatient: "Stable",
    discharged: "Discharged",
    inactive: "Discharged",
  };

  return {
    id: patient.id,
    name: patient.full_name,
    code: patient.patient_code,
    dob: new Date(patient.date_of_birth).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    sex: patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1),
    status: statusLabel[patient.status],
  };
}
