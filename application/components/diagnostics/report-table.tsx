"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileTextIcon } from "lucide-react"

export interface DiagnosticReport {
  id: string
  patient_name: string
  report_type: "lab" | "imaging" | "pathology" | "radiology" | "other"
  title: string
  status: "draft" | "pending_review" | "finalized" | "cancelled"
  ai_assisted: boolean
  report_date: string
  requested_by?: string
  findings?: string
  ai_summary?: string
}

const STATUS_STYLES: Record<DiagnosticReport["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600 border-gray-200" },
  pending_review: { label: "Pending Review", className: "bg-amber-50 text-amber-700 border-amber-200" },
  finalized: { label: "Finalized", className: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600 border-red-200" },
}

const TYPE_LABELS: Record<DiagnosticReport["report_type"], string> = {
  lab: "Lab",
  imaging: "Imaging",
  pathology: "Pathology",
  radiology: "Radiology",
  other: "Other",
}

interface ReportTableProps {
  reports: DiagnosticReport[]
}

export function ReportTable({ reports }: ReportTableProps) {
  const [selected, setSelected] = useState<DiagnosticReport | null>(null)

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileTextIcon className="size-10 mb-3 opacity-40" />
        <p className="text-sm">No reports found</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Patient</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const statusStyle = STATUS_STYLES[report.status]
              return (
                <tr
                  key={report.id}
                  className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-900">{report.patient_name}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{TYPE_LABELS[report.report_type]}</td>
                  <td className="py-3 px-4 text-gray-700 max-w-48 truncate">{report.title}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle.className}`}
                    >
                      {statusStyle.label}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {report.ai_assisted && (
                      <Badge
                        className="text-[10px] font-bold px-1.5 py-0"
                        style={{ backgroundColor: "#1a007d", color: "#fff", border: "none" }}
                      >
                        AI
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-500 whitespace-nowrap text-xs">{report.report_date}</td>
                  <td className="py-3 px-4">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setSelected(report)}
                    >
                      View Report
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? "Report"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="uppercase tracking-wide text-muted-foreground font-semibold">Patient</p>
                  <p className="mt-0.5 text-gray-900">{selected.patient_name}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-muted-foreground font-semibold">Type</p>
                  <p className="mt-0.5 text-gray-900">{TYPE_LABELS[selected.report_type]}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-muted-foreground font-semibold">Status</p>
                  <p className="mt-0.5 text-gray-900">{STATUS_STYLES[selected.status].label}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-muted-foreground font-semibold">Date</p>
                  <p className="mt-0.5 text-gray-900">{selected.report_date}</p>
                </div>
              </div>
              {selected.requested_by && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Requested by</p>
                  <p className="mt-0.5 text-gray-900">{selected.requested_by}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Findings</p>
                <p className="mt-1 text-gray-700 whitespace-pre-wrap">
                  {selected.findings?.trim() || "No findings recorded."}
                </p>
              </div>
              {selected.ai_summary?.trim() && (
                <div className="rounded-lg bg-[#E8F3FC]/80 border border-[#0062a1]/15 px-3 py-2">
                  <p className="text-xs font-semibold text-[#0062a1]">AI Summary</p>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap">{selected.ai_summary}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
