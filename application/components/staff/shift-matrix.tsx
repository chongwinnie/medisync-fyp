"use client"

import { AlertTriangle } from "lucide-react"

export interface ShiftEntry {
  id: string
  staff_name: string
  staff_id: string
  shift_date: string // YYYY-MM-DD
  shift_type: "morning" | "afternoon" | "night" | "on_call"
  conflict_flagged: boolean
  location?: string
}

const SHIFT_STYLES: Record<
  ShiftEntry["shift_type"],
  { bg: string; text: string; label: string }
> = {
  morning: { bg: "#dbeafe", text: "#1d4ed8", label: "Morning" },
  afternoon: { bg: "#fef3c7", text: "#92400e", label: "Afternoon" },
  night: { bg: "#002444", text: "#ffffff", label: "Night" },
  on_call: { bg: "#ede9fe", text: "#5b21b6", label: "On Call" },
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

interface ShiftMatrixProps {
  shifts: ShiftEntry[]
}

export function ShiftMatrix({ shifts }: ShiftMatrixProps) {
  const monday = getMondayOfWeek(new Date())
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return formatDate(d)
  })

  const staffNames = Array.from(new Set(shifts.map((s) => s.staff_name)))

  const shiftMap: Record<string, Record<string, ShiftEntry>> = {}
  for (const shift of shifts) {
    if (!shiftMap[shift.staff_name]) shiftMap[shift.staff_name] = {}
    shiftMap[shift.staff_name][shift.shift_date] = shift
  }

  const weekLabel = `${new Date(weekDates[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(weekDates[6]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">{weekLabel}</span>
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(SHIFT_STYLES).map(([type, style]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: style.bg, color: style.text }}
            >
              {style.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-gray-500 w-40 min-w-40">
                Staff Member
              </th>
              {weekDates.map((date, i) => (
                <th
                  key={date}
                  className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wide text-gray-500 text-center min-w-28"
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="font-normal normal-case text-gray-400">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffNames.map((name) => (
              <tr key={name} className="border-t border-gray-100 hover:bg-gray-50/40">
                <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">{name}</td>
                {weekDates.map((date) => {
                  const shift = shiftMap[name]?.[date]
                  if (!shift) {
                    return (
                      <td key={date} className="px-3 py-2.5 text-center">
                        <span className="text-gray-300 text-xs">—</span>
                      </td>
                    )
                  }
                  const style = SHIFT_STYLES[shift.shift_type]
                  return (
                    <td key={date} className="px-3 py-2.5 text-center">
                      <div
                        className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium"
                        style={{
                          backgroundColor: style.bg,
                          color: style.text,
                          border: shift.conflict_flagged ? "2px solid #E24B4A" : undefined,
                        }}
                      >
                        <span>{style.label}</span>
                        {shift.location && (
                          <span className="text-[10px] opacity-75">{shift.location}</span>
                        )}
                        {shift.conflict_flagged && (
                          <span className="flex items-center gap-0.5 text-[#E24B4A] text-[10px]">
                            <AlertTriangle className="size-3" />
                            Conflict
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {staffNames.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  No shifts scheduled for this week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
