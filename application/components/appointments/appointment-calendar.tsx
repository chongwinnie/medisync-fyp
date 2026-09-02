"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventHoveringArg,
  EventInput,
} from "@fullcalendar/core";
import type { AppointmentItem } from "@/lib/types/appointment";
import { fetchAppointmentsInRangeAction } from "@/lib/actions/appointments";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";

const STATUS_COLORS: Record<AppointmentItem["status"], string> = {
  scheduled: "#0062a1",
  confirmed: "#0d9488",
  in_progress: "#639922",
  completed: "#6B7280",
  cancelled: "#9CA3AF",
};

interface AppointmentCalendarProps {
  initialAppointments: AppointmentItem[];
  staffIdFilter?: string | null;
  editable?: boolean;
  onCreateRequest?: (start: Date, end: Date) => void;
  highlightId?: string | null;
}

function toEventInput(appointment: AppointmentItem): EventInput {
  const color = STATUS_COLORS[appointment.status] ?? "#0062a1";
  return {
    id: appointment.id,
    title: `${appointment.patient_name} — ${appointment.visit_type}`,
    start: appointment.start_time,
    end: appointment.end_time,
    backgroundColor: color,
    borderColor: color,
    extendedProps: {
      appointment,
    },
  };
}

function toBackgroundEvents(appointments: AppointmentItem[]): EventInput[] {
  return appointments
    .filter((a) => a.conflict_detected)
    .map((a) => ({
      id: `bg-${a.id}`,
      start: a.start_time,
      end: a.end_time,
      display: "background" as const,
      backgroundColor: "#FEE2E2",
      borderColor: "#E24B4A",
      extendedProps: { appointment: a },
    }));
}

export function AppointmentCalendar({
  initialAppointments,
  staffIdFilter = null,
  editable = true,
  onCreateRequest,
  highlightId,
}: AppointmentCalendarProps) {
  const [appointments, setAppointments] =
    useState<AppointmentItem[]>(initialAppointments);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AppointmentItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const rangeRef = useRef<{ start: string; end: string } | null>(null);

  const loadRange = useCallback(
    async (start: Date, end: Date) => {
      const data = await fetchAppointmentsInRangeAction(
        start.toISOString(),
        end.toISOString(),
        staffIdFilter
      );
      setAppointments(data);
    },
    [staffIdFilter]
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      rangeRef.current = {
        start: arg.start.toISOString(),
        end: arg.end.toISOString(),
      };
      void loadRange(arg.start, arg.end);
    },
    [loadRange]
  );

  const events = useMemo(() => {
    const regular = appointments.map(toEventInput);
    const backgrounds = toBackgroundEvents(appointments);
    return [...backgrounds, ...regular];
  }, [appointments]);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const appointment = info.event.extendedProps.appointment as
      | AppointmentItem
      | undefined;
    if (!appointment || info.event.display === "background") return;
    setSelectedAppointment(appointment);
    setDetailOpen(true);
  }, []);

  const handleEventMouseEnter = useCallback((info: EventHoveringArg) => {
    if (info.event.display !== "background") {
      setHoveredEventId(info.event.id);
      info.el.style.cursor = "pointer";
      info.el.style.opacity = "0.9";
    }
  }, []);

  const handleEventMouseLeave = useCallback((info: EventHoveringArg) => {
    setHoveredEventId(null);
    info.el.style.opacity = "1";
  }, []);

  const handleDateSelect = useCallback(
    (selectInfo: DateSelectArg) => {
      if (!editable || !onCreateRequest) return;
      onCreateRequest(selectInfo.start, selectInfo.end);
      selectInfo.view.calendar.unselect();
    },
    [editable, onCreateRequest]
  );

  return (
    <>
      <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 appointment-calendar">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          navLinks
          navLinkDayClick="timeGridDay"
          navLinkWeekClick="timeGridWeek"
          editable={false}
          selectable={editable && !!onCreateRequest}
          selectMirror
          dayMaxEventRows={3}
          eventMaxStack={3}
          moreLinkClick="popover"
          moreLinkText={(num) => `+${num} more`}
          dayPopoverFormat={{
            month: "long",
            day: "numeric",
            year: "numeric",
          }}
          slotMinTime="06:00:00"
          slotMaxTime="20:00:00"
          allDaySlot
          nowIndicator
          height="auto"
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          eventMouseEnter={handleEventMouseEnter}
          eventMouseLeave={handleEventMouseLeave}
          select={handleDateSelect}
          eventContent={(arg: EventContentArg) => {
            const isHovered = hoveredEventId === arg.event.id;
            const isHighlighted = highlightId === arg.event.id;
            return (
              <div
                className={`px-1 py-0.5 text-xs truncate rounded ${
                  isHovered || isHighlighted ? "ring-2 ring-white" : ""
                }`}
                title={arg.event.title}
              >
                {arg.event.title}
              </div>
            );
          }}
        />
      </div>

      <AppointmentDetailSheet
        appointment={selectedAppointment}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        editable={editable}
        onUpdated={() => {
          if (rangeRef.current) {
            void loadRange(
              new Date(rangeRef.current.start),
              new Date(rangeRef.current.end)
            );
          }
        }}
      />
    </>
  );
}
