"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AppointmentItem } from "@/lib/types/appointment";
import {
  cancelAppointmentAction,
  updateAppointmentAction,
} from "@/lib/actions/appointments";

interface AppointmentDetailSheetProps {
  appointment: AppointmentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable?: boolean;
  onUpdated?: () => void;
}

export function AppointmentDetailSheet({
  appointment,
  open,
  onOpenChange,
  editable = true,
  onUpdated,
}: AppointmentDetailSheetProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!appointment) return null;

  async function handleConfirm() {
    if (!appointment) return;
    setLoading(true);
    try {
      await updateAppointmentAction({ id: appointment.id, status: "confirmed" });
      onUpdated?.();
      onOpenChange(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!appointment) return;
    setLoading(true);
    try {
      await cancelAppointmentAction(appointment.id);
      onUpdated?.();
      onOpenChange(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{appointment.patient_name}</SheetTitle>
          <SheetDescription>{appointment.visit_type}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant="outline" className="capitalize">
              {appointment.status.replace("_", " ")}
            </Badge>
            {appointment.conflict_detected && (
              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                Conflict
              </Badge>
            )}
          </div>
          <p>
            <span className="text-muted-foreground">Staff: </span>
            {appointment.staff_name}
          </p>
          <p>
            <span className="text-muted-foreground">When: </span>
            {new Date(appointment.start_time).toLocaleString("en-GB")} –{" "}
            {new Date(appointment.end_time).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {appointment.room && (
            <p>
              <span className="text-muted-foreground">Room: </span>
              {appointment.room}
            </p>
          )}
          {appointment.notes && (
            <p>
              <span className="text-muted-foreground">Notes: </span>
              {appointment.notes}
            </p>
          )}
          {appointment.patient_id && (
            <Button
              variant="link"
              className="h-auto p-0 justify-start text-[#0062a1]"
              onClick={() => {
                onOpenChange(false);
                router.push(`/patients/${appointment.patient_id}`);
              }}
            >
              View patient profile
            </Button>
          )}
        </div>

        {editable && appointment.status !== "cancelled" && (
          <SheetFooter className="px-4 gap-2">
            {appointment.status === "scheduled" && (
              <Button
                onClick={() => void handleConfirm()}
                disabled={loading}
                className="flex-1"
                style={{ backgroundColor: "#0062a1", color: "#fff" }}
              >
                Confirm
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void handleCancel()}
              disabled={loading}
              className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
            >
              Cancel appointment
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
