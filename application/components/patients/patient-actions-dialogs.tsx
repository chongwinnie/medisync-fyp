"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  dischargePatientAction,
  createConsultationAction,
} from "@/lib/actions/patients";

interface PatientActionsDialogsProps {
  patientId: string;
  patientName: string;
  consultationOpen: boolean;
  onConsultationOpenChange: (open: boolean) => void;
  dischargeOpen: boolean;
  onDischargeOpenChange: (open: boolean) => void;
}

export function PatientActionsDialogs({
  patientId,
  patientName,
  consultationOpen,
  onConsultationOpenChange,
  dischargeOpen,
  onDischargeOpenChange,
}: PatientActionsDialogsProps) {
  const router = useRouter();
  const [complaint, setComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConsultation() {
    if (!complaint.trim()) {
      setError("Please enter a chief complaint");
      return;
    }
    setSubmitting(true);
    const result = await createConsultationAction(patientId, complaint.trim());
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Failed to create consultation");
      return;
    }
    setComplaint("");
    setError(null);
    onConsultationOpenChange(false);
    router.refresh();
  }

  async function handleDischarge() {
    setSubmitting(true);
    const result = await dischargePatientAction(patientId);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Failed to discharge patient");
      return;
    }
    onDischargeOpenChange(false);
    router.refresh();
  }

  return (
    <>
      <Dialog open={consultationOpen} onOpenChange={onConsultationOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Consultation</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label>Chief Complaint</Label>
            <Textarea
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="Describe the reason for consultation..."
              className="min-h-24"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onConsultationOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleConsultation()}
              disabled={submitting}
              className="bg-[#0062a1] text-white"
            >
              {submitting ? "Creating..." : "Create Consultation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dischargeOpen} onOpenChange={onDischargeOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discharge {patientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the patient as discharged and release any active bed
              allocation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDischarge()}
              className="bg-red-600 hover:bg-red-700"
            >
              {submitting ? "Discharging..." : "Confirm Discharge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
