"use client";

import { useState, useMemo } from "react";
import { Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PatientTable,
  type PatientRow,
} from "@/components/patients/patient-table";
import { PatientQuickView } from "@/components/patients/patient-quick-view";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { useRequireRole } from "@/hooks/use-require-role";
import { useServerRole } from "@/components/providers/role-provider";

type StatusFilter = "all" | "outpatient" | "admitted" | "discharged";

interface PatientsPageClientProps {
  patients: PatientRow[];
  doctors: Array<{ id: string; name: string }>;
  currentStaffId: string | null;
}

export function PatientsPageClient({
  patients,
  doctors,
  currentStaffId,
}: PatientsPageClientProps) {
  const { isLoading, isAllowed } = useRequireRole(["doctor", "nurse", "admin"]);
  const role = useServerRole();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeTab, setActiveTab] = useState("all");

  const filteredPatients = useMemo(() => {
    let result = patients;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (patient) =>
          patient.full_name.toLowerCase().includes(query) ||
          patient.patient_code.toLowerCase().includes(query) ||
          patient.primary_doctor?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((patient) => patient.status === statusFilter);
    }

    if (activeTab === "admitted") {
      result = result.filter((patient) => patient.status === "admitted");
    } else if (activeTab === "discharged") {
      result = result.filter((patient) => patient.status === "discharged");
    } else if (activeTab === "my-patients" && currentStaffId) {
      result = result.filter(
        (patient) => patient.primary_doctor_id === currentStaffId
      );
    }

    return result;
  }, [patients, searchQuery, statusFilter, activeTab, currentStaffId]);

  const admittedCount = patients.filter(
    (patient) => patient.status === "admitted"
  ).length;
  const dischargedCount = patients.filter(
    (patient) => patient.status === "discharged"
  ).length;

  if (isLoading || !isAllowed) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-[#002444]">
                Patient Management
              </h1>
              <Badge className="bg-[#0062a1]/10 text-[#0062a1] border-[#0062a1]/20 border font-semibold text-xs">
                {patients.length} patients
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Manage and track patient records, admissions, and discharges.
            </p>
          </div>
          {role === "admin" && (
            <Button
              className="bg-[#0062a1] hover:bg-[#002444] text-white rounded-lg gap-2"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="size-4" />
              Add Patient
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search patients…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-8 bg-white border-slate-200"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
            {(
              [
                { value: "all", label: "All" },
                { value: "outpatient", label: "Outpatient" },
                { value: "admitted", label: "Admitted" },
                { value: "discharged", label: "Discharged" },
              ] as { value: StatusFilter; label: string }[]
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === option.value
                    ? "bg-[#0062a1] text-white"
                    : "text-slate-500 hover:text-[#002444] hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col gap-0"
        >
          <TabsList
            variant="line"
            className="w-full justify-start gap-4 bg-transparent border-b border-slate-200 rounded-none pb-0"
          >
            <TabsTrigger value="all" className="text-sm pb-2">
              All
            </TabsTrigger>
            <TabsTrigger value="my-patients" className="text-sm pb-2">
              My Patients
            </TabsTrigger>
            <TabsTrigger value="admitted" className="text-sm pb-2">
              Admitted
              <Badge className="ml-1.5 bg-[#0062a1]/10 text-[#0062a1] border-0 text-[10px] font-semibold h-4 px-1.5">
                {admittedCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="discharged" className="text-sm pb-2">
              Discharged
              <Badge className="ml-1.5 bg-slate-100 text-slate-500 border-0 text-[10px] font-semibold h-4 px-1.5">
                {dischargedCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {["all", "my-patients", "admitted", "discharged"].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <PatientTable
                patients={filteredPatients}
                onSelect={setSelectedPatient}
              />
            </TabsContent>
          ))}
        </Tabs>

      <PatientQuickView
        patient={selectedPatient}
        onClose={() => setSelectedPatient(null)}
      />

      <AddPatientModal
        open={addOpen}
        onOpenChange={setAddOpen}
        doctors={doctors}
      />
    </div>
  );
}
