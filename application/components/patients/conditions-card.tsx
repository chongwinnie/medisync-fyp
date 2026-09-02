import { Badge } from "@/components/ui/badge";
import type { Condition } from "./patient-header";

const SEVERITY_CONFIG: Record<
  Condition["severity"],
  { label: string; className: string }
> = {
  mild: {
    label: "Mild",
    className: "bg-[#f0f7e6] text-[#639922] border-[#c6e89a]",
  },
  moderate: {
    label: "Moderate",
    className: "bg-amber-50 text-[#BA7517] border-amber-200",
  },
  severe: {
    label: "Severe",
    className: "bg-[#fdf0f0] text-[#E24B4A] border-[#fcc]",
  },
  critical: {
    label: "Critical",
    className: "bg-red-100 text-red-700 border-red-300 font-bold",
  },
};

function ConditionItem({ condition }: { condition: Condition }) {
  const severityConfig = SEVERITY_CONFIG[condition.severity];
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#002444] truncate">
          {condition.condition_name}
        </p>
        {condition.icd_code && (
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            ICD-10: {condition.icd_code}
          </p>
        )}
        {condition.onset_date && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            Since{" "}
            {new Date(condition.onset_date).toLocaleDateString("en-GB", {
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
      </div>
      <Badge
        variant="outline"
        className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold border ${severityConfig.className}`}
      >
        {severityConfig.label}
      </Badge>
    </div>
  );
}

export function ConditionsCard({ conditions }: { conditions: Condition[] }) {
  const active = conditions.filter((c) => c.is_active);
  const inactive = conditions.filter((c) => !c.is_active);

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-[#002444] mb-3">
        Active Conditions
        <span className="ml-1.5 text-xs font-normal text-slate-400">
          ({active.length})
        </span>
      </h2>

      {active.length === 0 && (
        <p className="text-xs text-slate-400 italic">No active conditions.</p>
      )}
      <div className="flex flex-col gap-2">
        {active.map((c) => (
          <ConditionItem key={c.id} condition={c} />
        ))}
      </div>

      {inactive.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-[#002444] mt-5 mb-3">
            Past Conditions
            <span className="ml-1.5 text-xs font-normal text-slate-400">
              ({inactive.length})
            </span>
          </h2>
          <div className="flex flex-col gap-2 opacity-60">
            {inactive.map((c) => (
              <ConditionItem key={c.id} condition={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
