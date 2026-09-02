"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { callQueuePatientAction } from "@/lib/actions/appointments";

export interface QueueItem {
  id: string;
  queue_number: number;
  patient_name: string;
  status: "waiting" | "called" | "in_consultation" | "done" | "skipped";
  checked_in_at?: string;
}

interface QueueBoardProps {
  queue: QueueItem[];
}

const STATUS_LABELS: Record<QueueItem["status"], string> = {
  waiting: "Waiting",
  called: "Called",
  in_consultation: "In Consultation",
  done: "Done",
  skipped: "Skipped",
};

function StatusBadge({ status }: { status: QueueItem["status"] }) {
  const styles: Record<QueueItem["status"], React.CSSProperties> = {
    waiting: { backgroundColor: "#FEF3C7", color: "#92400E" },
    called: { backgroundColor: "#DBEAFE", color: "#0062a1" },
    in_consultation: { backgroundColor: "#DCFCE7", color: "#166534" },
    done: { backgroundColor: "#F3F4F6", color: "#6B7280" },
    skipped: { backgroundColor: "#FEE2E2", color: "#991B1B" },
  };

  return (
    <Badge
      variant="outline"
      style={styles[status]}
      className="border-0 text-xs font-medium"
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function QueueBoard({ queue }: QueueBoardProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waitingCount = queue.filter((q) => q.status === "waiting").length;
  const inConsultCount = queue.filter(
    (q) => q.status === "in_consultation" || q.status === "called"
  ).length;
  const doneCount = queue.filter((q) => q.status === "done").length;

  async function handleCallNext(queueId: string) {
    setBusyId(queueId);
    setError(null);
    const result = await callQueuePatientAction(queueId);
    setBusyId(null);
    if (!result.success) {
      setError(result.error ?? "Failed to call patient");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Waiting</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "#BA7517" }}>
            {waitingCount}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">In Consultation</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "#639922" }}>
            {inConsultCount}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Done Today</p>
          <p className="mt-1 text-2xl font-bold text-muted-foreground">
            {doneCount}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-[#E24B4A] px-1">{error}</p>
      )}

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-[3rem_1fr_auto_auto] items-center gap-4 border-b px-4 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">#</span>
          <span className="text-xs font-medium text-muted-foreground">
            Patient
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Status
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Action
          </span>
        </div>

        {queue.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[3rem_1fr_auto_auto] items-center gap-4 border-b px-4 py-3 last:border-0 hover:bg-gray-50"
          >
            <span
              className="text-sm font-bold"
              style={{
                color: item.status === "waiting" ? "#0062a1" : "#9CA3AF",
              }}
            >
              {String(item.queue_number).padStart(3, "0")}
            </span>
            <div>
              <p className="text-sm font-medium">{item.patient_name}</p>
              {item.checked_in_at && (
                <p className="text-xs text-muted-foreground">
                  Checked in {item.checked_in_at}
                </p>
              )}
            </div>
            <StatusBadge status={item.status} />
            <Button
              size="sm"
              variant="outline"
              disabled={item.status !== "waiting" || busyId === item.id}
              className="text-xs"
              style={
                item.status === "waiting"
                  ? { borderColor: "#0062a1", color: "#0062a1" }
                  : {}
              }
              onClick={() => void handleCallNext(item.id)}
            >
              {busyId === item.id ? "Calling…" : "Call Next"}
            </Button>
          </div>
        ))}

        {queue.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No patients in queue
          </div>
        )}
      </div>
    </div>
  );
}
