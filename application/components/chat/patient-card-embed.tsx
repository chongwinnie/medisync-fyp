"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPatientCard } from "@/lib/actions/patients";

interface PatientRecord {
  id: string;
  name: string;
  code: string;
  dob: string;
  sex: string;
  status: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Stable: { bg: "#63992215", text: "#639922" },
  "High Risk": { bg: "#BA751715", text: "#BA7517" },
  Critical: { bg: "#E24B4A15", text: "#E24B4A" },
  Discharged: { bg: "#00244415", text: "#002444" },
};

interface PatientCardEmbedProps {
  patientId: string;
}

export function PatientCardEmbed({ patientId }: PatientCardEmbedProps) {
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPatient() {
      setLoading(true);
      const result = await fetchPatientCard(patientId);
      if (!cancelled) {
        setPatient(result);
        setLoading(false);
      }
    }

    void loadPatient();

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading) {
    return (
      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Loading patient record…
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Patient record not found: {patientId}
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[patient.status] ?? STATUS_STYLES.Stable;
  const initials = patient.name
    .split(" ")
    .map((namePart) => namePart[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: "#0062a1" }}
        >
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{patient.name}</p>
          <p className="text-[11px] text-gray-500">
            DOB: {patient.dob} • {patient.sex} • {patient.code}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
        >
          {patient.status}
        </span>
        <Link
          href={`/patients/${patient.id}`}
          className="text-[11px] font-medium underline underline-offset-2"
          style={{ color: "#0062a1" }}
        >
          View Profile
        </Link>
      </div>
    </div>
  );
}
