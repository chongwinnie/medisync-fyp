"use client"

import type { AppointmentItem } from "@/components/appointments/staff-calendar"
import { Badge } from "@/components/ui/badge"

interface DoctorScheduleCalendarProps {
  appointments: AppointmentItem[]
}

const STATUS_LABEL: Record<AppointmentItem["status"], string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

const STATUS_STYLE: Record<AppointmentItem["status"], React.CSSProperties> = {
  scheduled: { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  confirmed: { backgroundColor: "#DBEAFE", color: "#0062a1" },
  in_progress: { backgroundColor: "#DCFCE7", color: "#166534" },
  completed: { backgroundColor: "#F0FDF4", color: "#639922" },
  cancelled: { backgroundColor: "#F3F4F6", color: "#9CA3AF" },
}

const HOUR_START = 8
const HOUR_END = 18

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay()
  const monday = new Date(referenceDate)
  monday.setDate(referenceDate.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function DoctorScheduleCalendar({ appointments }: DoctorScheduleCalendarProps) {
  const today = new Date()
  const weekDays = getWeekDays(today)

  const timeSlots = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  const todayAppts = appointments
    .filter((a) => new Date(a.start_time).toDateString() === today.toDateString())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  function getApptsForDayAndHour(day: Date, hour: number) {
    return appointments.filter((a) => {
      const d = new Date(a.start_time)
      return d.toDateString() === day.toDateString() && d.getHours() === hour
    })
  }

  return (
    <div className="flex gap-4">
      {/* Week grid */}
      <div className="flex-1 rounded-xl bg-white shadow-sm overflow-auto">
        {/* Day header */}
        <div
          className="grid border-b sticky top-0 bg-white z-10"
          style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}
        >
          <div className="border-r" />
          {weekDays.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString()
            return (
              <div
                key={i}
                className="py-3 text-center border-r last:border-0"
                style={isToday ? { borderBottom: `2px solid #0062a1` } : {}}
              >
                <p className="text-xs font-medium text-muted-foreground">{DAY_LABELS[i]}</p>
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

        {/* Time rows */}
        {timeSlots.map((hour) => (
          <div
            key={hour}
            className="grid border-b last:border-0"
            style={{ gridTemplateColumns: `56px repeat(7, 1fr)`, minHeight: 56 }}
          >
            <div className="border-r px-2 pt-1">
              <span className="text-[10px] text-muted-foreground">
                {hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`}
              </span>
            </div>
            {weekDays.map((day, dayIdx) => {
              const isToday = day.toDateString() === today.toDateString()
              const slotAppts = getApptsForDayAndHour(day, hour)

              return (
                <div
                  key={dayIdx}
                  className="relative border-r last:border-0 p-0.5"
                  style={isToday ? { backgroundColor: "#F0F9FF" } : {}}
                >
                  {slotAppts.map((appt) => (
                    <div
                      key={appt.id}
                      className="rounded px-1.5 py-1 mb-0.5"
                      style={{
                        backgroundColor: STATUS_STYLE[appt.status].backgroundColor,
                        borderLeft: `3px solid ${STATUS_STYLE[appt.status].color}`,
                      }}
                    >
                      <p
                        className="text-[10px] font-semibold truncate"
                        style={{ color: STATUS_STYLE[appt.status].color }}
                      >
                        {appt.patient_name}
                      </p>
                      <p className="text-[9px] text-gray-500 truncate">{appt.visit_type}</p>
                      {appt.room && (
                        <p className="text-[9px] text-gray-400 truncate">{appt.room}</p>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Today's list panel */}
      <div className="w-64 shrink-0 rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Today,{" "}
            {today.toLocaleDateString("en-US", { day: "numeric", month: "long" })}
          </p>
          <p className="mt-0.5 text-sm font-bold">
            {todayAppts.length} Total
          </p>
        </div>

        <div className="divide-y overflow-y-auto" style={{ maxHeight: 560 }}>
          {todayAppts.map((appt) => {
            const startTime = new Date(appt.start_time)
            const endTime = new Date(appt.end_time)
            const isNow = appt.status === "in_progress"

            return (
              <div
                key={appt.id}
                className="flex gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                style={isNow ? { borderLeft: "3px solid #0062a1" } : { borderLeft: "3px solid transparent" }}
              >
                <div className="shrink-0 w-12 text-right">
                  <p className="text-sm font-bold" style={{ color: isNow ? "#0062a1" : "#374151" }}>
                    {startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-semibold truncate">{appt.patient_name}</p>
                    <Badge
                      variant="outline"
                      className="border-0 text-[10px] shrink-0"
                      style={STATUS_STYLE[appt.status]}
                    >
                      {STATUS_LABEL[appt.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{appt.visit_type}</p>
                  {appt.room && (
                    <p className="text-[10px] text-gray-400">⬜ {appt.room}</p>
                  )}
                </div>
              </div>
            )
          })}

          {todayAppts.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No appointments today
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
