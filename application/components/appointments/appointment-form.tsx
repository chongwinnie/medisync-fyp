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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  checkAppointmentConflictsAction,
  createAppointmentAction,
} from "@/lib/actions/appointments";

interface AppointmentFormProps {
  open: boolean;
  onClose: () => void;
  patients: Array<{ id: string; name: string; patient_code: string }>;
  staff: Array<{ id: string; name: string }>;
  defaultStaffId?: string;
  defaultStart?: Date;
  defaultEnd?: Date;
}

interface FormData {
  patientId: string;
  staffId: string;
  visitType: string;
  date: string;
  startTime: string;
  duration: string;
  notes: string;
}

function buildDefaultForm(
  defaultStaffId?: string,
  defaultStart?: Date
): FormData {
  const date = defaultStart
    ? defaultStart.toISOString().slice(0, 10)
    : "";
  const startTime = defaultStart
    ? defaultStart.toTimeString().slice(0, 5)
    : "";
  return {
    patientId: "",
    staffId: defaultStaffId ?? "",
    visitType: "",
    date,
    startTime,
    duration: "30",
    notes: "",
  };
}

export function AppointmentForm({
  open,
  onClose,
  patients,
  staff,
  defaultStaffId,
  defaultStart,
}: AppointmentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(() =>
    buildDefaultForm(defaultStaffId, defaultStart)
  );
  const [conflictStatus, setConflictStatus] = useState<
    "idle" | "checking" | "clear" | "conflict"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setConflictStatus("idle");
  }

  function buildTimes() {
    const start = new Date(`${form.date}T${form.startTime}:00`);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + Number(form.duration));
    return { start, end };
  }

  async function handleCheckConflicts() {
    if (!form.staffId || !form.date || !form.startTime) return;
    setConflictStatus("checking");
    const { start, end } = buildTimes();
    const hasConflict = await checkAppointmentConflictsAction(
      form.staffId,
      start.toISOString(),
      end.toISOString()
    );
    setConflictStatus(hasConflict ? "conflict" : "clear");
  }

  async function handleBook() {
    if (!form.patientId || !form.staffId || !form.visitType || !form.date || !form.startTime) {
      setError("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { start, end } = buildTimes();

    const result = await createAppointmentAction({
      patientId: form.patientId,
      staffId: form.staffId,
      visitType: form.visitType,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: Number(form.duration),
      notes: form.notes || undefined,
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Failed to book appointment");
      return;
    }

    handleClose();
    router.refresh();
  }

  function handleClose() {
    setForm(buildDefaultForm(defaultStaffId, defaultStart));
    setConflictStatus("idle");
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Appointment</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-2">
          <div className="flex flex-col gap-1.5">
            <Label>Patient</Label>
            <Select value={form.patientId} onValueChange={(v) => set("patientId", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select patient..." />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name} ({patient.patient_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Staff</Label>
            <Select
              value={form.staffId}
              onValueChange={(v) => set("staffId", v)}
              disabled={!!defaultStaffId && staff.length === 1}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select staff..." />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="appt-date">Date</Label>
              <Input
                id="appt-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="appt-time">Time</Label>
              <Input
                id="appt-time"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Duration</Label>
            <Select value={form.duration} onValueChange={(v) => set("duration", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select duration..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Visit Type</Label>
            <Select value={form.visitType} onValueChange={(v) => set("visitType", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consultation">Consultation</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="admission">Admission</SelectItem>
                <SelectItem value="discharge">Discharge</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="appt-notes">Notes</Label>
            <Textarea
              id="appt-notes"
              placeholder="Additional notes..."
              className="resize-none min-h-20"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-sm text-muted-foreground">System check:</p>
            {conflictStatus === "idle" && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {conflictStatus === "checking" && (
              <span className="text-xs text-amber-600">Checking...</span>
            )}
            {conflictStatus === "clear" && (
              <span className="text-xs font-medium text-green-700">
                No conflicts
              </span>
            )}
            {conflictStatus === "conflict" && (
              <span className="text-xs font-medium text-red-600">
                Conflict detected
              </span>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <SheetFooter className="px-4 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => void handleCheckConflicts()}
          >
            Check Conflicts
          </Button>
          <Button
            type="button"
            className="flex-1"
            style={{ backgroundColor: "#0062a1", color: "#fff" }}
            onClick={() => void handleBook()}
            disabled={submitting}
          >
            {submitting ? "Booking..." : "Book Appointment"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
