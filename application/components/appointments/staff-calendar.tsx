"use client"

import type { AppointmentItem } from "@/lib/types/appointment"

export type { AppointmentItem } from "@/lib/types/appointment";

interface StaffCalendarProps {
  appointments: AppointmentItem[]
}

const STATUS_COLORS: Record<AppointmentItem["status"], { bg: string; border: string; text: string }> = {
  scheduled: { bg: "#DBEAFE", border: "#93C5FD", text: "#1D4ED8" },
  confirmed: { bg: "#DBEAFE", border: "#0062a1", text: "#0062a1" },
  in_progress: { bg: "#DCFCE7", border: "#639922", text: "#166534" },
  completed: { bg: "#F3F4F6", border: "#D1D5DB", text: "#6B7280" },
  cancelled: { bg: "#F3F4F6", border: "#E5E7EB", text: "#9CA3AF" },
}

const HOUR_START = 8
const HOUR_END = 18
const TOTAL_HOURS = HOUR_END - HOUR_START
const CELL_HEIGHT = 56 // px per hour

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay() // 0=Sun
  const monday = new Date(referenceDate)
  monday.setDate(referenceDate.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isoToMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function formatHour(h: number): string {
  return h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function StaffCalendar({ appointments }: StaffCalendarProps) {
  const today = new Date()
  const weekDays = getWeekDays(today)

  const staffNames = Array.from(new Set(appointments.map((a) => a.staff_name)))

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i)

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-auto">
      {/* Header row: time gutter + days */}
      <div
        className="grid border-b sticky top-0 bg-white z-10"
        style={{ gridTemplateColumns: `160px repeat(7, 1fr)` }}
      >
        <div className="py-3 px-3 border-r" />
        {weekDays.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString()
          return (
            <div
              key={i}
              className="py-3 text-center border-r last:border-0"
            >
              <p
                className="text-xs font-medium"
                style={{ color: isToday ? "#0062a1" : "#6B7280" }}
              >
                {DAY_LABELS[i]}
              </p>
              <p
                className="text-lg font-bold"
                style={{ color: isToday ? "#0062a1" : "#111827" }}
              >
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* Staff rows */}
      {staffNames.map((staffName) => {
        const staffAppts = appointments.filter((a) => a.staff_name === staffName)

        return (
          <div key={staffName} className="border-b last:border-0">
            {/* Staff label */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `160px repeat(7, 1fr)` }}
            >
              <div className="flex items-start pt-2 px-3 border-r">
                <div className="flex items-center gap-2">
                  <div
                    className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: "#002444" }}
                  >
                    {staffName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-gray-700 leading-tight">{staffName}</span>
                </div>
              </div>

              {/* Day columns for this staff member */}
              {weekDays.map((d, dayIdx) => {
                const dayAppts = staffAppts.filter((a) => {
                  const apptDate = new Date(a.start_time)
                  return apptDate.toDateString() === d.toDateString()
                })

                return (
                  <div
                    key={dayIdx}
                    className="relative border-r last:border-0"
                    style={{ height: CELL_HEIGHT * TOTAL_HOURS }}
                  >
                    {/* Hour grid lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute w-full border-t border-gray-100"
                        style={{ top: (h - HOUR_START) * CELL_HEIGHT }}
                      />
                    ))}

                    {/* Appointment blocks */}
                    {dayAppts.map((appt) => {
                      const startMin = isoToMinutes(appt.start_time)
                      const endMin = isoToMinutes(appt.end_time)
                      const top = (startMin - HOUR_START * 60) * (CELL_HEIGHT / 60)
                      const height = Math.max((endMin - startMin) * (CELL_HEIGHT / 60), 20)
                      const colors = STATUS_COLORS[appt.status]
                      const isConflict = appt.status === "scheduled" && dayAppts.some(
                        (other) =>
                          other.id !== appt.id &&
                          new Date(other.start_time) < new Date(appt.end_time) &&
                          new Date(other.end_time) > new Date(appt.start_time)
                      )

                      return (
                        <div
                          key={appt.id}
                          className="absolute left-1 right-1 rounded px-1.5 py-1 overflow-hidden cursor-pointer hover:opacity-90"
                          style={{
                            top,
                            height,
                            backgroundColor: isConflict ? "#FEE2E2" : colors.bg,
                            borderLeft: `3px solid ${isConflict ? "#E24B4A" : colors.border}`,
                          }}
                        >
                          {isConflict && (
                            <span
                              className="text-[9px] font-bold uppercase tracking-wide"
                              style={{ color: "#E24B4A" }}
                            >
                              CONFLICT
                            </span>
                          )}
                          <p
                            className="text-[10px] font-semibold truncate leading-tight"
                            style={{ color: isConflict ? "#991B1B" : colors.text }}
                          >
                            {new Date(appt.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {" – "}
                            {new Date(appt.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: isConflict ? "#991B1B" : colors.text }}>
                            {appt.patient_name}
                          </p>
                          {appt.room && (
                            <p className="text-[9px] truncate text-gray-400">{appt.room}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Time labels on left (decorative, overlay approach) */}
      <div className="sr-only" aria-hidden>
        {hours.map((h) => (
          <span key={h}>{formatHour(h)}</span>
        ))}
      </div>
    </div>
  )
}
