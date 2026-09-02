"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Stethoscope, LogOut, FileDown } from "lucide-react";
import { useServerRole } from "@/components/providers/role-provider";
import { EditPatientSheet } from "./edit-patient-sheet";
import { PatientActionsDialogs } from "./patient-actions-dialogs";

export interface PatientDetail {
  id: string;
  patient_code: string;
  full_name: string;
  date_of_birth: string;
  gender: "male" | "female" | "other" | "unknown";
  status: "outpatient" | "admitted" | "discharged" | "inactive";
  blood_type?: string;
  ward?: string;
  admitted_at?: string;
  primary_doctor?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact?: { name: string; relationship: string; phone: string };
  allergies?: string[];
  conditions: Condition[];
  medications: Medication[];
  treatment_plan_items: TreatmentPlanItem[];
}

export interface Condition {
  id: string;
  condition_name: string;
  icd_code?: string;
  severity: "mild" | "moderate" | "severe" | "critical";
  is_active: boolean;
  onset_date?: string;
}

export interface Medication {
  id: string;
  drug_name: string;
  dosage: string;
  frequency: string;
  route?: string;
  start_date?: string;
  status: "active" | "completed" | "stopped" | "paused";
}

export interface TreatmentPlanItem {
  id: string;
  intervention: string;
  frequency: string;
  responsible_role: string;
  status: "pending" | "in_progress" | "completed";
}

const STATUS_CONFIG: Record<
  PatientDetail["status"],
  { label: string; className: string }
> = {
  admitted: {
    label: "Admitted",
    className: "bg-[#dbeafe] text-[#0062a1] border-[#bfdbfe]",
  },
  outpatient: {
    label: "Outpatient",
    className: "bg-[#f0f7e6] text-[#639922] border-[#c6e89a]",
  },
  discharged: {
    label: "Discharged",
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
  inactive: {
    label: "Inactive",
    className: "bg-[#fdf0f0] text-[#E24B4A] border-[#fcc]",
  },
};

function getAge(dob: string): number {
  // Entirely UTC date-only math so SSR and CSR agree (F-14).
  const parts = dob.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  const [year, month, day] = parts;
  const now = new Date();
  const todayY = now.getUTCFullYear();
  const todayM = now.getUTCMonth();
  const todayD = now.getUTCDate();
  let age = todayY - year;
  const monthIdx = month - 1;
  if (todayM < monthIdx || (todayM === monthIdx && todayD < day)) {
    age--;
  }
  return age;
}

function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const MONTHS_SHORT = [
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
] as const;

function formatDate(dateStr: string): string {
  const parts = dateStr.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "—";
  const [year, month, day] = parts;
  const monthLabel = MONTHS_SHORT[month - 1];
  if (!monthLabel) return "—";
  return `${day} ${monthLabel} ${year}`;
}

interface PatientHeaderProps {
  patient: PatientDetail;
  doctors?: Array<{ id: string; name: string }>;
}

export function PatientHeader({ patient, doctors = [] }: PatientHeaderProps) {
  const role = useServerRole();
  const [editOpen, setEditOpen] = useState(false);
  const [consultationOpen, setConsultationOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);

  const statusConfig = STATUS_CONFIG[patient.status];
  const admittedLabel = patient.admitted_at ? formatDate(patient.admitted_at) : "—";
  const ageYears = getAge(patient.date_of_birth);

  const canEdit = role === "admin" || role === "doctor";
  const canConsult = role === "admin" || role === "doctor" || role === "nurse";
  const canDischarge =
    (role === "admin" || role === "doctor") && patient.status === "admitted";

  return (
    <>
      <div className="rounded-xl bg-white border border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-full bg-[#002444] flex items-center justify-center text-white text-lg font-bold shrink-0 select-none">
              {getInitials(patient.full_name)}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-[#002444]">
                  {patient.full_name}
                </h1>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold border ${statusConfig.className}`}
                >
                  {statusConfig.label}
                </Badge>
                {patient.blood_type && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold border bg-red-50 text-red-600 border-red-200"
                  >
                    {patient.blood_type}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                ID: {patient.patient_code}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Edit className="size-3.5" />
                Edit Patient
              </Button>
            )}
            {canConsult && (
              <Button
                size="sm"
                className="gap-1.5 text-xs bg-[#0062a1] hover:bg-[#002444] text-white"
                onClick={() => setConsultationOpen(true)}
              >
                <Stethoscope className="size-3.5" />
                New Consultation
              </Button>
            )}
            {canDischarge && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-[#E24B4A] border-[#E24B4A]/40 hover:bg-[#fdf0f0] hover:text-[#E24B4A]"
                onClick={() => setDischargeOpen(true)}
              >
                <LogOut className="size-3.5" />
                Discharge
              </Button>
            )}
            <a
              href={`/api/pdf/patient/${patient.id}?download=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md border border-slate-200 bg-white text-[#002444] hover:bg-slate-50 transition-colors shadow-xs"
              title="Download Clinical Summary PDF"
            >
              <FileDown className="size-3.5 text-[#0062a1]" />
              PDF Summary
            </a>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-6 flex-wrap">
          {[
            { label: "Age", value: `${ageYears} yrs` },
            { label: "Ward", value: patient.ward ?? "—" },
            { label: "Admitted", value: admittedLabel },
            { label: "Consultant", value: patient.primary_doctor ?? "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                {label}
              </p>
              <p className="text-sm font-medium text-[#002444] mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <EditPatientSheet
          patient={patient}
          open={editOpen}
          onOpenChange={setEditOpen}
          doctors={doctors}
        />
      )}

      <PatientActionsDialogs
        patientId={patient.id}
        patientName={patient.full_name}
        consultationOpen={consultationOpen}
        onConsultationOpenChange={setConsultationOpen}
        dischargeOpen={dischargeOpen}
        onDischargeOpenChange={setDischargeOpen}
      />
    </>
  );
}
