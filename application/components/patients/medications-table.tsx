import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Medication } from "./patient-header";

const STATUS_CONFIG: Record<
  Medication["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-[#f0f7e6] text-[#639922] border-[#c6e89a]",
  },
  completed: {
    label: "Completed",
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
  stopped: {
    label: "Stopped",
    className: "bg-[#fdf0f0] text-[#E24B4A] border-[#fcc]",
  },
  paused: {
    label: "Paused",
    className: "bg-amber-50 text-[#BA7517] border-amber-200",
  },
};

export function MedicationsTable({
  medications,
}: {
  medications: Medication[];
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-[#002444]">
          Medications
          <span className="ml-1.5 text-xs font-normal text-slate-400">
            ({medications.length})
          </span>
        </h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            {["Drug", "Dosage", "Frequency", "Route", "Start Date", "Status"].map(
              (h) => (
                <TableHead
                  key={h}
                  className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold py-2 first:pl-5 last:pr-5"
                >
                  {h}
                </TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {medications.map((med, index) => {
            const statusConfig = STATUS_CONFIG[med.status];
            return (
              <TableRow
                key={med.id}
                className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
              >
                <TableCell className="pl-5 py-3 font-medium text-[#002444] text-sm">
                  {med.drug_name}
                </TableCell>
                <TableCell className="py-3 text-sm text-slate-600">
                  {med.dosage}
                </TableCell>
                <TableCell className="py-3 text-sm text-slate-600">
                  {med.frequency}
                </TableCell>
                <TableCell className="py-3 text-sm text-slate-600">
                  {med.route ?? <span className="text-slate-300">—</span>}
                </TableCell>
                <TableCell className="py-3 text-sm text-slate-600">
                  {med.start_date ? (
                    new Date(med.start_date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TableCell>
                <TableCell className="py-3 pr-5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold border ${statusConfig.className}`}
                  >
                    {statusConfig.label}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
          {medications.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-slate-400"
              >
                No medications recorded.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
