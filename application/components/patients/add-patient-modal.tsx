"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { createPatientAction } from "@/lib/actions/patients";

interface AddPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctors: Array<{ id: string; name: string }>;
  asAdmission?: boolean;
  title?: string;
}

function generatePatientCode(): string {
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `PT-${suffix}`;
}

function createEmptyForm() {
  return {
    patientCode: generatePatientCode(),
    fullName: "",
    dateOfBirth: "",
    gender: "",
    bloodType: "",
    phone: "",
    primaryDoctorId: "",
  };
}

export function AddPatientModal({
  open,
  onOpenChange,
  doctors,
  asAdmission = false,
  title = "Add Patient",
}: AddPatientModalProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(createEmptyForm);
  // Reset form when parent opens the dialog (supports setOpen(true) callers).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setForm(createEmptyForm());
    }
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    const patientCode = form.patientCode.trim() || generatePatientCode();
    if (!patientCode || !form.fullName || !form.dateOfBirth || !form.gender) {
      setError("Please fill in required fields");
      return;
    }
    if (!form.patientCode.trim()) {
      setForm((prev) => ({ ...prev, patientCode }));
    }

    setSubmitting(true);
    setError(null);

    const result = await createPatientAction({
      patientCode,
      fullName: form.fullName,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender as "male" | "female" | "other" | "unknown",
      bloodType: form.bloodType || undefined,
      phone: form.phone || undefined,
      primaryDoctorId: form.primaryDoctorId || undefined,
      asAdmission,
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Failed to create patient");
      return;
    }

    handleDialogOpenChange(false);
    if (result.id) {
      router.push(`/patients/${result.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Patient Code</Label>
            <Input
              value={form.patientCode}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, patientCode: e.target.value }))
              }
              placeholder="PT-1052"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Full Name</Label>
            <Input
              value={form.fullName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fullName: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
                  setForm((prev) => ({ ...prev, gender: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                <SelectValue placeholder="Optional..." />
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

        <DialogFooter>
          <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="bg-[#0062a1] hover:bg-[#002444] text-white"
          >
            {submitting
              ? "Creating..."
              : asAdmission
                ? "Admit Patient"
                : "Create Patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
