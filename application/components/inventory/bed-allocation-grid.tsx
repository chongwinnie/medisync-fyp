"use client";

import * as React from "react";

export interface Room {
  id: string;
  room_number: string;
  ward: string;
  bed_count: number;
  occupied_beds: number;
  status: "available" | "occupied" | "cleaning" | "maintenance";
  patient_name?: string;
}

interface BedAllocationGridProps {
  rooms: Room[];
}

const STATUS_CONFIG: Record<
  Room["status"],
  { badge: string; badgeText: string; cardBorder: string; icon: string }
> = {
  available: {
    badge: "bg-green-100 text-[#639922] border border-green-200",
    badgeText: "Available",
    cardBorder: "border-l-4 border-l-[#639922]",
    icon: "✓",
  },
  occupied: {
    badge: "bg-red-100 text-[#E24B4A] border border-red-200",
    badgeText: "Occupied",
    cardBorder: "border-l-4 border-l-[#E24B4A]",
    icon: "👤",
  },
  cleaning: {
    badge: "bg-orange-100 text-[#BA7517] border border-orange-200",
    badgeText: "Cleaning",
    cardBorder: "border-l-4 border-l-[#BA7517]",
    icon: "🧹",
  },
  maintenance: {
    badge: "bg-gray-100 text-gray-600 border border-gray-200",
    badgeText: "Maintenance",
    cardBorder: "border-l-4 border-l-gray-400",
    icon: "🔧",
  },
};

function RoomCard({ room }: { room: Room }) {
  const config = STATUS_CONFIG[room.status];
  const occupancyPct =
    room.bed_count > 0
      ? Math.round((room.occupied_beds / room.bed_count) * 100)
      : 0;

  return (
    <div
      className={`rounded-lg bg-white ring-1 ring-black/10 p-3 flex flex-col gap-2 ${config.cardBorder} hover:shadow-md transition-shadow cursor-default`}
    >
      {/* Room number + icon */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-gray-800">
          {room.room_number}
        </span>
        <span className="text-base">{config.icon}</span>
      </div>

      {/* Patient name if occupied */}
      {room.patient_name && (
        <span className="text-xs text-gray-600 truncate">
          {room.patient_name}
        </span>
      )}

      {/* Bed occupancy dots */}
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: room.bed_count }).map((_, idx) => (
          <span
            key={idx}
            className="inline-block w-3 h-3 rounded-full"
            style={{
              backgroundColor:
                idx < room.occupied_beds ? "#0062a1" : "#639922",
            }}
            title={idx < room.occupied_beds ? "Occupied" : "Available"}
          />
        ))}
      </div>

      {/* Occupancy stats */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {room.occupied_beds}/{room.bed_count} beds
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}
        >
          {config.badgeText}
        </span>
      </div>

      {/* Occupancy bar */}
      <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${occupancyPct}%`,
            backgroundColor:
              occupancyPct >= 100
                ? "#E24B4A"
                : occupancyPct >= 75
                ? "#BA7517"
                : "#639922",
          }}
        />
      </div>
    </div>
  );
}

export function BedAllocationGrid({ rooms }: BedAllocationGridProps) {
  // Derive wards from actual room data (seed uses "General Ward", "ICU", etc.)
  const wardsWithRooms = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const room of rooms) {
      const ward = room.ward || "General";
      if (!seen.has(ward)) {
        seen.add(ward);
        ordered.push(ward);
      }
    }
    return ordered;
  }, [rooms]);

  const [selectedWard, setSelectedWard] = React.useState<string | null>(null);
  const activeWard =
    selectedWard && wardsWithRooms.includes(selectedWard)
      ? selectedWard
      : (wardsWithRooms[0] ?? "");

  const filtered = rooms.filter((r) => r.ward === activeWard);

  const totals = filtered.reduce(
    (acc, r) => {
      acc.total += r.bed_count;
      acc.occupied += r.occupied_beds;
      return acc;
    },
    { total: 0, occupied: 0 }
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Ward tabs */}
      <div className="flex items-center gap-2">
        {wardsWithRooms.map((ward) => (
          <button
            key={ward}
            onClick={() => setSelectedWard(ward)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={
              activeWard === ward
                ? { backgroundColor: "#0062a1", color: "#fff" }
                : {
                    backgroundColor: "#fff",
                    color: "#374151",
                    border: "1px solid #e5e7eb",
                  }
            }
          >
            {ward}
          </button>
        ))}

        {/* Summary */}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#639922" }}
            />
            Available
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#E24B4A" }}
            />
            Occupied
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#BA7517" }}
            />
            Cleaning
          </span>
          <span className="text-gray-400">|</span>
          <span>
            {totals.occupied}/{totals.total} beds occupied
          </span>
        </div>
      </div>

      {/* Room grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white ring-1 ring-black/10 p-10 text-center text-gray-400 text-sm">
          No rooms in this ward.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}
