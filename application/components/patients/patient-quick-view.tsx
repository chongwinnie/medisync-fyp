"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VitalsGrid } from "./vitals-grid";
import type { PatientRow } from "./patient-table";

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

function getAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

interface OverviewRowProps {
  label: string;
  value: React.ReactNode;
}

function OverviewRow({ label, value }: OverviewRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 uppercase tracking-wide font-medium">
        {label}
      </span>
      <span className="text-sm text-[#002444] font-medium">{value}</span>
    </div>
  );
}

interface PatientQuickViewProps {
  patient: PatientRow | null;
  onClose: () => void;
}

export function PatientQuickView({ patient, onClose }: PatientQuickViewProps) {
  const isOpen = patient !== null;
  const statusStyle = patient ? STATUS_STYLES[patient.status] : null;
  const age = patient ? getAge(patient.date_of_birth) : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] flex flex-col p-0 gap-0"
      >
        {patient && statusStyle && (
          <>
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3 pr-8">
                <div className="size-10 rounded-full bg-[#0062a1]/15 flex items-center justify-center text-sm font-semibold text-[#0062a1] shrink-0">
                  {patient.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-[#002444] text-base font-semibold leading-tight">
                    {patient.full_name}
                  </SheetTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {patient.patient_code}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`ml-auto shrink-0 text-[10px] font-medium border ${statusStyle.className}`}
                >
                  {statusStyle.label}
                </Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="overview" className="flex flex-col h-full">
                <div className="px-5 pt-3 border-b border-slate-100">
                  <TabsList variant="line" className="w-full justify-start gap-4">
                    <TabsTrigger value="overview" className="text-sm">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="vitals" className="text-sm">
                      Vitals
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="px-5 py-4 flex-1">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                    <OverviewRow label="Age" value={`${age} years old`} />
                    <OverviewRow
                      label="Gender"
                      value={
                        patient.gender.charAt(0).toUpperCase() +
                        patient.gender.slice(1)
                      }
                    />
                    <OverviewRow
                      label="Date of Birth"
                      value={new Date(patient.date_of_birth).toLocaleDateString(
                        "en-GB",
                        { day: "2-digit", month: "long", year: "numeric" }
                      )}
                    />
                    <OverviewRow label="Blood Type" value="A+" />
                    <OverviewRow label="Allergies" value="Penicillin, NSAIDs" />
                    <OverviewRow
                      label="Primary Doctor"
                      value={
                        patient.primary_doctor ?? (
                          <span className="text-slate-300">Not assigned</span>
                        )
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="vitals" className="px-5 py-4 flex-1">
                  <VitalsGrid />
                </TabsContent>
              </Tabs>
            </div>

            <SheetFooter className="px-5 py-4 border-t border-slate-100">
              <Button
                asChild
                className="w-full bg-[#0062a1] hover:bg-[#002444] text-white rounded-lg"
              >
                <Link href={`/patients/${patient.id}`}>
                  <ExternalLink className="size-4 mr-2" />
                  Open Full Profile
                </Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
