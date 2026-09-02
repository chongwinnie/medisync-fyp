"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RotateCcw, CheckCircle, Clock, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TreatmentPlanItem } from "./patient-header";
import type { TreatmentPlanSummary } from "@/lib/data/patients";
import { useAuth } from "@/hooks/use-auth";
import {
  approveTreatmentPlanAction,
  regenerateTreatmentPlanDraftAction,
} from "@/lib/actions/treatment-plans";

const ITEM_STATUS_CONFIG: Record<
  TreatmentPlanItem["status"],
  { icon: React.ReactNode; className: string }
> = {
  completed: {
    icon: <CheckCircle className="size-4 text-[#639922]" />,
    className: "text-[#639922]",
  },
  in_progress: {
    icon: <Clock className="size-4 text-[#BA7517]" />,
    className: "text-[#BA7517]",
  },
  pending: {
    icon: <Circle className="size-4 text-slate-400" />,
    className: "text-slate-400",
  },
};

export function TreatmentPlanPanel({
  patientId,
  items,
  plan,
}: {
  patientId: string;
  items: TreatmentPlanItem[];
  plan?: TreatmentPlanSummary | null;
}) {
  const { role } = useAuth();
  const router = useRouter();
  const canWrite = role === "doctor";
  const isApproved = plan?.status === "active" || plan?.status === "completed";
  const [busy, setBusy] = useState<"approve" | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (!plan?.id || !canWrite) return;
    setBusy("approve");
    setError(null);
    const result = await approveTreatmentPlanAction({
      planId: plan.id,
      patientId,
    });
    setBusy(null);
    if (!result.success) {
      setError(result.error ?? "Failed to approve");
      return;
    }
    router.refresh();
  }

  async function handleRegenerate() {
    if (!plan?.id || !canWrite) return;
    setBusy("regenerate");
    setError(null);
    const result = await regenerateTreatmentPlanDraftAction({
      planId: plan.id,
      patientId,
    });
    setBusy(null);
    if (!result.success) {
      setError(result.error ?? "Failed to regenerate");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4" data-patient-id={patientId}>
      {plan ? (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#1a007d]/10 bg-[#1a007d]/[0.03]">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#1a007d]" />
              <span className="text-sm font-semibold text-[#1a007d]">
                AI-Drafted Treatment Plan
              </span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] font-semibold bg-[#f0f7e6] text-[#639922] border-[#c6e89a] capitalize"
            >
              {plan.status}
            </Badge>
          </div>

          <div className="p-5">
            <div className="rounded-lg bg-[#E8F3FC]/60 border border-[#0062a1]/10 p-4 mb-5">
              <h3 className="font-semibold text-[#002444] text-base">
                {plan.title}
              </h3>
              {plan.objectives && (
                <div className="mt-4 pt-4 border-t border-[#0062a1]/10">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                    Objectives
                  </p>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">
                    {plan.objectives}
                  </p>
                </div>
              )}
              {plan.aiDraftContent && (
                <div className="mt-4 pt-4 border-t border-[#0062a1]/10">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                    AI Draft
                  </p>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">
                    {plan.aiDraftContent}
                  </p>
                </div>
              )}
            </div>

            {canWrite ? (
              <div className="flex items-center gap-3">
                {isApproved ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-[#639922]">
                    <CheckCircle className="size-4" />
                    Approved
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="bg-[#002444] hover:bg-[#001830] text-white gap-1.5 text-xs"
                    onClick={() => void handleApprove()}
                    disabled={busy !== null}
                  >
                    <CheckCircle className="size-3.5" />
                    {busy === "approve" ? "Approving…" : "Review & Approve"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-[#0062a1] border-[#0062a1]/30 hover:bg-[#E8F3FC]"
                  onClick={() => void handleRegenerate()}
                  disabled={busy !== null}
                >
                  <RotateCcw
                    className={`size-3.5 ${busy === "regenerate" ? "animate-spin" : ""}`}
                  />
                  {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Read-only view. Doctors approve and regenerate treatment plans.
              </p>
            )}

            {error && (
              <p className="mt-2 text-xs text-[#E24B4A]">{error}</p>
            )}

            <p className="mt-4 text-[11px] text-slate-400 italic">
              This is an AI-assisted draft. Clinician review required before activation.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200 p-5">
          <p className="text-sm text-slate-400">
            No treatment plan has been created for this patient yet.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[#002444] mb-3">
            Intervention Plan
          </h2>
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const statusConfig = ITEM_STATUS_CONFIG[item.status];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100"
                >
                  {statusConfig.icon}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#002444] truncate">
                      {item.intervention}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {item.frequency} · {item.responsible_role}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold capitalize shrink-0 border ${statusConfig.className} border-current/30`}
                  >
                    {item.status.replace("_", " ")}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
