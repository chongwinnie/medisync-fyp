"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { allocateBedAction } from "@/lib/actions/inventory";

interface AllocateBedFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableRooms?: Array<{ id: string; room_number: string; ward: string }>;
  patients?: Array<{ id: string; name: string; patient_code?: string }>;
}

const AI_SUGGESTION =
  "Suggested: Assign incoming ER patient to an available room based on isolation requirements.";

export function AllocateBedForm({
  open,
  onOpenChange,
  availableRooms = [],
  patients = [],
}: AllocateBedFormProps) {
  const router = useRouter();
  const [patientId, setPatientId] = React.useState("");
  const [roomId, setRoomId] = React.useState("");
  const [bedNumber, setBedNumber] = React.useState("");
  const [admissionDate, setAdmissionDate] = React.useState("");
  const [specialRequirements, setSpecialRequirements] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAllocate() {
    setSubmitting(true);
    setError(null);
    const result = await allocateBedAction({
      patientId,
      roomId,
      bedNumber: Number.parseInt(bedNumber, 10),
      admissionDate: admissionDate || undefined,
      specialRequirements: specialRequirements || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Allocation failed");
      return;
    }
    onOpenChange(false);
    setPatientId("");
    setRoomId("");
    setBedNumber("");
    setAdmissionDate("");
    setSpecialRequirements("");
    router.refresh();
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-gray-100">
          <SheetTitle className="text-lg font-semibold text-gray-900">
            Allocate Bed
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            Assign a patient to an available room.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* AI suggestion banner */}
          <div
            className="rounded-lg px-3 py-2.5 flex items-start gap-2 text-xs"
            style={{ backgroundColor: "#EEF6FF", color: "#0062a1" }}
          >
            <span className="mt-0.5 shrink-0">✨</span>
            <span>{AI_SUGGESTION}</span>
          </div>

          {/* Patient select */}
          <div className="grid gap-1.5">
            <Label htmlFor="patient-select" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Patient
            </Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger id="patient-select" className="h-9">
                <SelectValue placeholder="Select a patient..." />
              </SelectTrigger>
              <SelectContent>
                {patients.length > 0 ? (
                  patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name}
                      {patient.patient_code ? ` (${patient.patient_code})` : ""}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No patients available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Target room */}
          <div className="grid gap-1.5">
            <Label htmlFor="room-select" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Target Room
            </Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger id="room-select" className="h-9">
                <SelectValue placeholder="Select available room..." />
              </SelectTrigger>
              <SelectContent>
                {availableRooms.length > 0 ? (
                  availableRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Room {r.room_number} — {r.ward}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No available rooms
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Bed number */}
          <div className="grid gap-1.5">
            <Label htmlFor="bed-number" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Bed Number
            </Label>
            <Input
              id="bed-number"
              placeholder="e.g. 2"
              value={bedNumber}
              onChange={(e) => setBedNumber(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Admission date */}
          <div className="grid gap-1.5">
            <Label htmlFor="admission-date" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Admission Date
            </Label>
            <Input
              id="admission-date"
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Special requirements */}
          <div className="grid gap-1.5">
            <Label htmlFor="special-req" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Special Requirements
            </Label>
            <textarea
              id="special-req"
              placeholder="Notes..."
              value={specialRequirements}
              onChange={(e) => setSpecialRequirements(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </div>

        {error && (
          <p className="px-6 text-xs text-[#E24B4A]">{error}</p>
        )}

        <SheetFooter className="px-6 py-4 border-t border-gray-100 flex flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            style={{ backgroundColor: "#0062a1", color: "#fff" }}
            onClick={() => void handleAllocate()}
            disabled={submitting || !patientId || !roomId || !bedNumber}
          >
            {submitting ? "Allocating…" : "Allocate"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
