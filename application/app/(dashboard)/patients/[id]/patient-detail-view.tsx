"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PatientHeader } from "@/components/patients/patient-header";
import { ConditionsCard } from "@/components/patients/conditions-card";
import { MedicationsTable } from "@/components/patients/medications-table";
import { TreatmentPlanPanel } from "@/components/patients/treatment-plan-panel";
import type { PatientDetailData } from "@/lib/data/patients";
import { FlaskConical, ArrowRight } from "lucide-react";
import Link from "next/link";

const TABS = [
  "Overview",
  "Medical History",
  "Medications",
  "Treatment Plan",
  "Diagnostics",
] as const;

type Tab = (typeof TABS)[number];

interface PatientDetailViewProps {
  patient: PatientDetailData;
  doctors: Array<{ id: string; name: string }>;
}

export function PatientDetailView({ patient, doctors }: PatientDetailViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  return (
    <div className="flex flex-col gap-4">
      <PatientHeader patient={patient} doctors={doctors} />

      <div className="rounded-xl bg-white border border-slate-200">
        <div className="flex items-end gap-0 border-b border-slate-200 px-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                activeTab === tab
                  ? "border-[#0062a1] text-[#0062a1]"
                  : "border-transparent text-slate-500 hover:text-[#002444]"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "Overview" && <OverviewTab patient={patient} />}
          {activeTab === "Medical History" && (
            <MedicalHistoryTab patient={patient} />
          )}
          {activeTab === "Medications" && (
            <MedicationsTable medications={patient.medications} />
          )}
          {activeTab === "Treatment Plan" && (
            <TreatmentPlanPanel
              patientId={patient.id}
              items={patient.treatment_plan_items}
              plan={patient.treatmentPlan}
            />
          )}
          {activeTab === "Diagnostics" && (
            <DiagnosticsTab diagnostics={patient.diagnostics} />
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ patient }: { patient: PatientDetailData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[#002444] mb-4">
            Demographics
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {[
              { label: "Full Name", value: patient.full_name },
              { label: "Gender", value: patient.gender },
              {
                label: "Date of Birth",
                value: new Date(patient.date_of_birth).toLocaleDateString(
                  "en-GB",
                  { day: "2-digit", month: "short", year: "numeric" }
                ),
              },
              { label: "Blood Type", value: patient.blood_type ?? "—" },
              { label: "Phone", value: patient.phone ?? "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  {label}
                </dt>
                <dd className="text-sm text-[#002444] mt-0.5 truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-5">
          {patient.emergency_contact && (
            <div className="rounded-xl bg-white border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-[#002444] mb-3">
                Emergency Contact
              </h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "Name", value: patient.emergency_contact.name },
                  {
                    label: "Relationship",
                    value: patient.emergency_contact.relationship,
                  },
                  { label: "Phone", value: patient.emergency_contact.phone },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      {label}
                    </dt>
                    <dd className="text-sm text-[#002444] mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {patient.allergies && patient.allergies.length > 0 && (
            <div className="rounded-xl bg-[#fdf0f0] border border-[#fcc] p-5">
              <h2 className="text-sm font-semibold text-[#E24B4A] mb-3">
                Allergies
              </h2>
              <div className="flex flex-wrap gap-2">
                {patient.allergies.map((allergy) => (
                  <span
                    key={allergy}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-[#E24B4A] border border-[#fcc]"
                  >
                    {allergy}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[#002444] mb-3">
            Active Conditions
          </h2>
          {patient.conditions.filter((condition) => condition.is_active).length ===
          0 ? (
            <p className="text-sm text-slate-400">No active conditions recorded.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {patient.conditions
                .filter((condition) => condition.is_active)
                .map((condition) => (
                  <div
                    key={condition.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#002444]">
                        {condition.condition_name}
                      </p>
                      {condition.icd_code && (
                        <p className="text-[10px] text-slate-400 font-mono">
                          ICD-10: {condition.icd_code}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border",
                        condition.severity === "mild" &&
                          "bg-[#f0f7e6] text-[#639922] border-[#c6e89a]",
                        condition.severity === "moderate" &&
                          "bg-amber-50 text-[#BA7517] border-amber-200",
                        condition.severity === "severe" &&
                          "bg-[#fdf0f0] text-[#E24B4A] border-[#fcc]",
                        condition.severity === "critical" &&
                          "bg-red-100 text-red-700 border-red-300"
                      )}
                    >
                      {condition.severity}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[#002444] mb-3">
            Vitals Summary
          </h2>
          {patient.vitals.length === 0 ? (
            <p className="text-sm text-slate-400">No vitals recorded.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {patient.vitals.map(({ label, value, unit, flag }) => (
                <div
                  key={label}
                  className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    {label}
                  </p>
                  <p
                    className={cn(
                      "text-base font-bold mt-0.5",
                      flag === "high" || flag === "low"
                        ? "text-[#E24B4A]"
                        : "text-[#002444]"
                    )}
                  >
                    {value}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      {unit}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MedicalHistoryTab({ patient }: { patient: PatientDetailData }) {
  return (
    <div className="flex flex-col gap-5">
      <ConditionsCard conditions={patient.conditions} />

      <div className="rounded-xl bg-white border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-[#002444] mb-4">
          Case History Timeline
        </h2>
        {patient.caseHistory.length === 0 ? (
          <p className="text-sm text-slate-400">No case history recorded.</p>
        ) : (
          <div className="flex flex-col gap-0">
            {patient.caseHistory.map((entry, index) => (
              <div key={entry.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="size-2.5 rounded-full bg-[#0062a1] mt-1 shrink-0" />
                  {index < patient.caseHistory.length - 1 && (
                    <div className="w-px flex-1 bg-slate-200 my-1" />
                  )}
                </div>
                <div className="pb-5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    {entry.date}
                  </p>
                  <p className="text-sm font-semibold text-[#002444] mt-0.5">
                    {entry.event}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{entry.note}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosticsTab({
  diagnostics,
}: {
  diagnostics: PatientDetailData["diagnostics"];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl bg-[#E8F3FC] border border-[#0062a1]/20 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="size-5 text-[#0062a1]" />
          <div>
            <p className="text-sm font-semibold text-[#002444]">
              Detailed Diagnostic Reports
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Visit /diagnostics for full imaging, lab, and pathology reports.
            </p>
          </div>
        </div>
        <Link
          href="/diagnostics"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0062a1] hover:text-[#002444] transition-colors shrink-0"
        >
          View Diagnostics
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {diagnostics.length === 0 ? (
        <p className="text-sm text-slate-400">No diagnostic reports for this patient.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {diagnostics.map((diag) => (
            <div
              key={diag.id}
              className="rounded-xl bg-white border border-slate-200 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#002444]">{diag.test}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Ordered: {diag.ordered}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2.5 py-1 rounded-full border uppercase tracking-wide",
                    diag.status === "Results Available"
                      ? "bg-[#f0f7e6] text-[#639922] border-[#c6e89a]"
                      : "bg-amber-50 text-[#BA7517] border-amber-200"
                  )}
                >
                  {diag.status}
                </span>
              </div>
              {diag.summary && (
                <div className="mt-3 rounded-lg bg-[#E8F3FC]/60 border border-[#0062a1]/10 px-4 py-3">
                  <p className="text-xs text-slate-600 italic">
                    <span className="font-semibold text-[#0062a1] not-italic">
                      AI Summary:{" "}
                    </span>
                    {diag.summary}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
