"use client";

import * as React from "react";

export interface TheatreBooking {
  id: string;
  theatre: string;
  procedure: string;
  lead_surgeon: string;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
}

interface TheatreBookingsTableProps {
  bookings: TheatreBooking[];
}

const STATUS_CONFIG: Record<
  TheatreBooking["status"],
  { label: string; className: string }
> = {
  scheduled: {
    label: "Scheduled",
    className: "bg-blue-100 text-blue-700 border border-blue-200",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-orange-100 text-[#BA7517] border border-orange-200",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-[#639922] border border-green-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-500 border border-gray-200",
  },
};

function StatusBadge({ status }: { status: TheatreBooking["status"] }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function TheatreBookingsTable({ bookings }: TheatreBookingsTableProps) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-black/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Theatre Bookings
        </h3>
        <span className="text-xs text-gray-400">
          {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Theatre</th>
              <th className="px-4 py-3 text-left font-medium">Procedure</th>
              <th className="px-4 py-3 text-left font-medium">Lead Surgeon</th>
              <th className="px-4 py-3 text-left font-medium">Patient</th>
              <th className="px-4 py-3 text-left font-medium">Start</th>
              <th className="px-4 py-3 text-left font-medium">End</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-gray-400 text-sm"
                >
                  No theatre bookings found.
                </td>
              </tr>
            )}
            {bookings.map((booking) => (
              <tr
                key={booking.id}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                <td className="px-4 py-3 font-semibold text-gray-900">
                  {booking.theatre}
                </td>
                <td className="px-4 py-3 text-gray-700">{booking.procedure}</td>
                <td className="px-4 py-3 text-gray-700">
                  {booking.lead_surgeon}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {booking.patient_name}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  <div>{formatDate(booking.start_time)}</div>
                  <div className="font-medium text-gray-700">
                    {formatTime(booking.start_time)}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  <div>{formatDate(booking.end_time)}</div>
                  <div className="font-medium text-gray-700">
                    {formatTime(booking.end_time)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={booking.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
