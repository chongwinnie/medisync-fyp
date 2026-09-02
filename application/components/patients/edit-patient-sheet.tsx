"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePatientAction } from "@/lib/actions/patients";
import type { PatientDetail } from "@/components/patients/patient-header";

interface EditPatientSheetProps {
  patient: PatientDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctors: Array<{ id: string; name: string }>;
}

export function EditPatientSheet({
  patient,
  open,
  onOpenChange,
  doctors,
}: EditPatientSheetProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: patient.full_name,
    dateOfBirth: patient.date_of_birth,
    gender: patient.gender,
    bloodType: patient.blood_type ?? "",
    phone: patient.phone ?? "",
    primaryDoctorId: "",
  });

  async function handleSave() {
    setSubmitting(true);
    setError(null);

    const result = await updatePatientAction({
      id: patient.id,
      fullName: form.fullName,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      bloodType: form.bloodType || undefined,
      phone: form.phone || undefined,
      primaryDoctorId: form.primaryDoctorId || undefined,
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Failed to update patient");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Patient</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Full Name</Label>
            <Input
              value={form.fullName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fullName: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date of Birth</Label>
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Gender</Label>
            <Select
              value={form.gender}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  gender: v as PatientDetail["gender"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Blood Type</Label>
            <Input
              value={form.bloodType}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, bloodType: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Primary Doctor</Label>
            <Select
              value={form.primaryDoctorId}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, primaryDoctorId: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select doctor..." />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((doctor) => (
                  <SelectItem key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <SheetFooter className="px-4">
          <Button
            onClick={() => void handleSave()}
            disabled={submitting}
            className="w-full bg-[#0062a1] hover:bg-[#002444] text-white"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
