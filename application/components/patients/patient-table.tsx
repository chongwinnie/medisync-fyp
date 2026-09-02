"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface PatientRow {
  id: string;
  patient_code: string;
  full_name: string;
  date_of_birth: string;
  gender: "male" | "female" | "other" | "unknown";
  status: "outpatient" | "admitted" | "discharged" | "inactive";
  primary_doctor?: string;
  primary_doctor_id?: string;
  admitted_at?: string;
}

function getAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const STATUS_STYLES: Record<
  PatientRow["status"],
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

const GENDER_LABEL: Record<PatientRow["gender"], string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "—",
};

interface PatientTableProps {
  patients: PatientRow[];
  onSelect: (patient: PatientRow) => void;
}

export function PatientTable({ patients, onSelect }: PatientTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2 pl-4">
              Patient Code
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2">
              Name
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2">
              DOB / Age
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2">
              Gender
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2">
              Status
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2">
              Doctor
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2 pr-4">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patients.map((patient, index) => {
            const statusStyle = STATUS_STYLES[patient.status];
            const age = getAge(patient.date_of_birth);
            const dobFormatted = new Date(
              patient.date_of_birth
            ).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });

            return (
              <TableRow
                key={patient.id}
                onClick={() => onSelect(patient)}
                className={`cursor-pointer py-0 ${
                  index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                } hover:bg-[#E8F3FC]/60 transition-colors`}
              >
                <TableCell className="pl-4 py-2 font-mono text-xs text-slate-500">
                  {patient.patient_code}
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-[#0062a1]/15 flex items-center justify-center text-[10px] font-semibold text-[#0062a1] shrink-0">
                      {patient.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <span className="font-medium text-[#002444] text-sm">
                      {patient.full_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2 text-xs text-slate-600">
                  <div>{dobFormatted}</div>
                  <div className="text-slate-400">{age} yrs</div>
                </TableCell>
                <TableCell className="py-2 text-xs text-slate-600">
                  {GENDER_LABEL[patient.gender]}
                </TableCell>
                <TableCell className="py-2">
                  <Badge
                    className={`text-[10px] font-medium border ${statusStyle.className}`}
                    variant="outline"
                  >
                    {statusStyle.label}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 text-xs text-slate-600">
                  {patient.primary_doctor ?? <span className="text-slate-300">—</span>}
                </TableCell>
                <TableCell className="py-2 pr-4">
                  <Link
                    href={`/patients/${patient.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-[#0062a1] hover:text-[#002444] font-medium transition-colors"
                  >
                    View Profile
                    <ArrowRight className="size-3" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}

          {patients.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-12 text-center text-sm text-slate-400"
              >
                No patients found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
