"use client";

import { Heart, Activity, Thermometer, Wind, Weight } from "lucide-react";
import type { PatientVitalSummary } from "@/lib/data/patients";

interface VitalCard {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  status: "normal" | "warning" | "critical";
}

const STATUS_COLORS: Record<VitalCard["status"], string> = {
  normal: "#639922",
  warning: "#BA7517",
  critical: "#E24B4A",
};

const STATUS_BG: Record<VitalCard["status"], string> = {
  normal: "bg-[#f0f7e6]",
  warning: "bg-[#fdf4e3]",
  critical: "bg-[#fdf0f0]",
};

const ICONS: Record<string, React.ReactNode> = {
  "Heart Rate": <Heart className="size-4" />,
  "Blood Pressure": <Activity className="size-4" />,
  Temperature: <Thermometer className="size-4" />,
  "O₂ Saturation": <Wind className="size-4" />,
  Weight: <Weight className="size-4" />,
};

function mapFlagToStatus(flag: PatientVitalSummary["flag"]): VitalCard["status"] {
  if (flag === "high" || flag === "low") return "warning";
  return "normal";
}

interface VitalsGridProps {
  vitals?: PatientVitalSummary[];
}

export function VitalsGrid({ vitals = [] }: VitalsGridProps) {
  const cards: VitalCard[] =
    vitals.length > 0
      ? vitals.map((vital) => ({
          label: vital.label,
          value: vital.value,
          unit: vital.unit,
          icon: ICONS[vital.label] ?? <Activity className="size-4" />,
          status: mapFlagToStatus(vital.flag),
        }))
      : [
          {
            label: "No vitals",
            value: "—",
            unit: "",
            icon: <Activity className="size-4" />,
            status: "normal" as const,
          },
        ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((vital) => (
        <div
          key={vital.label}
          className={`rounded-xl p-3 ${STATUS_BG[vital.status]}`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span style={{ color: STATUS_COLORS[vital.status] }}>
              {vital.icon}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {vital.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-xl font-semibold"
              style={{ color: STATUS_COLORS[vital.status] }}
            >
              {vital.value}
            </span>
            {vital.unit && (
              <span className="text-xs text-slate-500">{vital.unit}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
