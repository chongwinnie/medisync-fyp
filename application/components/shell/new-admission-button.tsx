"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { listDoctorOptionsAction } from "@/lib/actions/patients";

export function NewAdmissionButton() {
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>(
    []
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listDoctorOptionsAction().then((rows) => {
      if (!cancelled) setDoctors(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full gap-2 font-semibold"
        style={{ backgroundColor: "var(--sapphire)", color: "#ffffff" }}
      >
        <Plus className="w-4 h-4" />
        New Admission
      </Button>

      <AddPatientModal
        open={open}
        onOpenChange={setOpen}
        doctors={doctors}
        asAdmission
        title="New Admission"
      />
    </>
  );
}
