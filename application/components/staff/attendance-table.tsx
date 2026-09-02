"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface AttendanceRecord {
  id: string
  staff_name: string
  attendance_date: string
  status: "present" | "absent" | "late" | "leave" | "half_day"
  clock_in?: string
  clock_out?: string
  hours_worked?: number
  overtime_hours?: number
}

const STATUS_STYLES: Record<
  AttendanceRecord["status"],
  { bg: string; text: string; label: string }
> = {
  present: { bg: "#639922", text: "#fff", label: "Present" },
  absent: { bg: "#E24B4A", text: "#fff", label: "Absent" },
  late: { bg: "#BA7517", text: "#fff", label: "Late" },
  leave: { bg: "#0062a1", text: "#fff", label: "Leave" },
  half_day: { bg: "#9ca3af", text: "#fff", label: "Half Day" },
}

interface AttendanceTableProps {
  records: AttendanceRecord[]
}

export function AttendanceTable({ records }: AttendanceTableProps) {
  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Date</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Staff</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Status</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Clock In</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Clock Out</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Hours</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Overtime</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const style = STATUS_STYLES[record.status]
            return (
              <TableRow key={record.id} className="hover:bg-gray-50/60">
                <TableCell className="text-sm text-gray-700">
                  {new Date(record.attendance_date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </TableCell>
                <TableCell className="font-medium text-gray-900">{record.staff_name}</TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {style.label}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-gray-700">{record.clock_in ?? "—"}</TableCell>
                <TableCell className="text-sm text-gray-700">{record.clock_out ?? "—"}</TableCell>
                <TableCell className="text-sm text-gray-700 text-right">
                  {record.hours_worked != null ? `${record.hours_worked}h` : "—"}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {record.overtime_hours != null && record.overtime_hours > 0 ? (
                    <span style={{ color: "#BA7517" }} className="font-medium">
                      +{record.overtime_hours}h
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
          {records.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                No attendance records found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
