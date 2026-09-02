"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  analyzeShiftConflictsAction,
  applyShiftSuggestionsAction,
  type ShiftSuggestion,
} from "@/lib/actions/shifts";
import type { ShiftEntry } from "@/components/staff/shift-matrix";

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

interface ShiftOptimizationPanelProps {
  open: boolean;
  onClose: () => void;
  shifts: ShiftEntry[];
}

export function ShiftOptimizationPanel({
  open,
  onClose,
  shifts,
}: ShiftOptimizationPanelProps) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [suggestions, setSuggestions] = useState<ShiftSuggestion[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const monday = getMondayOfWeek(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const weekLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const weekShiftCount = (() => {
    const start = monday.toISOString().slice(0, 10);
    const end = sunday.toISOString().slice(0, 10);
    return shifts.filter(
      (s) => s.shift_date >= start && s.shift_date <= end
    ).length;
  })();

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setStatusMessage(null);
    const result = await analyzeShiftConflictsAction(weekOffset);
    setIsAnalyzing(false);
    setHasAnalyzed(true);
    if (result.error) {
      setStatusMessage(result.error);
      setSuggestions([]);
      return;
    }
    setSuggestions(result.suggestions);
  }

  async function handleApply() {
    setIsApplying(true);
    setStatusMessage(null);
    const result = await applyShiftSuggestionsAction(suggestions);
    setIsApplying(false);
    if (!result.success) {
      setStatusMessage(result.error ?? "Failed to apply");
      return;
    }
    setStatusMessage(
      result.applied > 0
        ? `Cleared ${result.applied} conflict flag(s).`
        : (result.error ?? "No durable changes (advisory notes only).")
    );
    router.refresh();
  }

  function handleClose() {
    setHasAnalyzed(false);
    setSuggestions([]);
    setWeekOffset(0);
    setStatusMessage(null);
    onClose();
  }

  const canApply = suggestions.some((s) => s.action === "clear_conflict");

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-[600px] flex flex-col gap-0 p-0"
        showCloseButton={false}
      >
        <SheetHeader className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5" style={{ color: "#1a007d" }} />
              <SheetTitle
                className="text-lg font-semibold"
                style={{ color: "#1a007d" }}
              >
                AI Shift Optimization
              </SheetTitle>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Week
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setWeekOffset((w) => w - 1);
                  setHasAnalyzed(false);
                  setSuggestions([]);
                }}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Previous week"
              >
                <ChevronLeft className="size-4 text-gray-600" />
              </button>
              <span className="text-sm font-medium text-gray-800 min-w-52 text-center">
                {weekLabel}
              </span>
              <button
                onClick={() => {
                  setWeekOffset((w) => w + 1);
                  setHasAnalyzed(false);
                  setSuggestions([]);
                }}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Next week"
              >
                <ChevronRight className="size-4 text-gray-600" />
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Analyzing {weekShiftCount} published shift
              {weekShiftCount === 1 ? "" : "s"} from the live roster (not mock
              data).
            </p>
          </div>

          <Button
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing}
            className="w-full font-semibold"
            style={{ backgroundColor: "#1a007d", color: "#fff" }}
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing schedule…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Analyze Conflicts
              </span>
            )}
          </Button>

          {hasAnalyzed && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">
                {suggestions.length} suggestion
                {suggestions.length === 1 ? "" : "s"} from schedule data
              </p>
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          suggestion.confidence === "High"
                            ? "#dbeafe"
                            : suggestion.confidence === "Medium"
                              ? "#fef3c7"
                              : "#f3f4f6",
                        color:
                          suggestion.confidence === "High"
                            ? "#1d4ed8"
                            : suggestion.confidence === "Medium"
                              ? "#92400e"
                              : "#4b5563",
                      }}
                    >
                      {suggestion.confidence} Confidence
                    </span>
                    <Sparkles className="size-4" style={{ color: "#1a007d" }} />
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {suggestion.message}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!hasAnalyzed && !isAnalyzing && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Sparkles className="size-10 mb-3 opacity-30" />
              <p className="text-sm text-center max-w-sm">
                Run analysis against real shift_schedules for this week. Apply
                only clears conflict flags; coverage notes stay advisory.
              </p>
            </div>
          )}

          {statusMessage && (
            <p className="text-xs text-center text-gray-600">{statusMessage}</p>
          )}
        </div>

        <SheetFooter className="border-t border-gray-100 px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button
              className="flex-1 font-semibold"
              style={{ backgroundColor: "#0062a1", color: "#fff" }}
              disabled={!hasAnalyzed || !canApply || isApplying}
              onClick={() => void handleApply()}
            >
              {isApplying ? "Applying…" : "Apply Suggestions"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Close
            </Button>
          </div>
          <p className="text-xs text-center text-gray-400">
            Apply clears flagged conflicts in the database. Coverage notes
            require manual schedule edits.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
