import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/components/inventory/stock-table";
import type { Alert } from "@/components/inventory/active-alerts-panel";
import type { Room } from "@/components/inventory/bed-allocation-grid";
import type { TheatreBooking } from "@/components/inventory/theatre-bookings-table";
import { capitalize, formatRelativeTime, firstRelation } from "./utils";

const CATEGORY_LABELS: Record<string, string> = {
  medicine: "Medicine",
  supply: "Supply",
  equipment: "Equipment",
  consumable: "Consumable",
  other: "Other",
};

function mapRoomStatus(
  status: string,
  occupiedBeds: number,
  bedCount: number
): Room["status"] {
  if (status === "maintenance") return "maintenance";
  if (status === "closed") return "maintenance";
  if (occupiedBeds >= bedCount && bedCount > 0) return "occupied";
  if (status === "occupied" && occupiedBeds === 0) return "available";
  if (status === "available") return "available";
  return occupiedBeds > 0 ? "occupied" : "available";
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("item_name");

  if (error) {
    console.error("listInventoryItems:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    item_name: row.item_name,
    category: CATEGORY_LABELS[row.category] ?? capitalize(row.category),
    current_stock: row.current_stock,
    minimum_level: row.minimum_level,
    reorder_quantity: row.reorder_quantity,
    unit: row.unit,
    status: row.status === "recalled" ? "inactive" : row.status,
    expiry_date: row.expiry_date ?? undefined,
  }));
}

export async function listInventoryAlerts(): Promise<Alert[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_alerts")
    .select(
      `
      id,
      alert_type,
      severity,
      message,
      triggered_at,
      item_id,
      inventory_items (item_name)
    `
    )
    .eq("is_dismissed", false)
    .order("triggered_at", { ascending: false });

  if (error) {
    console.error("listInventoryAlerts:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const item = firstRelation(
      row.inventory_items as { item_name: string } | { item_name: string }[] | null
    );
    const alertType = row.alert_type as Alert["type"] | "other";

    return {
      id: row.id,
      type: alertType === "other" ? "reorder" : alertType,
      severity: row.severity,
      title:
        alertType === "low_stock"
          ? "Low Stock Alert"
          : alertType === "expiry"
            ? "Expiry Warning"
            : "Reorder Required",
      message: item?.item_name ? `${item.item_name}: ${row.message}` : row.message,
      timestamp: formatRelativeTime(row.triggered_at),
      item_id: row.item_id,
    };
  });
}

export async function listRoomsWithAllocations(): Promise<Room[]> {
  const supabase = await createClient();

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("*")
    .order("ward")
    .order("room_number");

  if (roomsError) {
    console.error("listRoomsWithAllocations:", roomsError.message);
    return [];
  }

  const { data: allocations, error: allocError } = await supabase
    .from("bed_allocations")
    .select("room_id, patients(full_name)")
    .eq("is_active", true);

  if (allocError) {
    console.error("listRoomsWithAllocations allocations:", allocError.message);
  }

  const allocationMap = new Map<string, string[]>();
  for (const allocation of allocations ?? []) {
    const patient = firstRelation(
      allocation.patients as { full_name: string } | { full_name: string }[] | null
    );
    const names = allocationMap.get(allocation.room_id) ?? [];
    if (patient?.full_name) names.push(patient.full_name);
    allocationMap.set(allocation.room_id, names);
  }

  return (rooms ?? []).map((room) => {
    const patientNames = allocationMap.get(room.id) ?? [];
    const occupiedBeds = patientNames.length;

    return {
      id: room.id,
      room_number: room.room_number,
      ward: room.ward ?? "General",
      bed_count: room.bed_count,
      occupied_beds: occupiedBeds,
      status: mapRoomStatus(room.status, occupiedBeds, room.bed_count),
      patient_name: patientNames[0],
    };
  });
}

export async function listTheatreBookings(): Promise<TheatreBooking[]> {
  const supabase = await createClient();

  // Prefer embedded relations; fall back to a flatter select if the FK hint fails.
  const primary = await supabase
    .from("theatre_bookings")
    .select(
      `
      id,
      procedure_name,
      start_time,
      end_time,
      status,
      patients (full_name),
      theatres (theatre_name),
      lead_surgeon:staff!theatre_bookings_lead_surgeon_id_fkey (full_name)
    `
    )
    .order("start_time", { ascending: false });

  const rows = primary.data;
  if (primary.error) {
    console.error("listTheatreBookings (embedded):", primary.error.message);
    const fallback = await supabase
      .from("theatre_bookings")
      .select(
        `
        id,
        procedure_name,
        start_time,
        end_time,
        status,
        theatre_id,
        patient_id,
        lead_surgeon_id
      `
      )
      .order("start_time", { ascending: false });

    if (fallback.error) {
      console.error("listTheatreBookings (fallback):", fallback.error.message);
      return [];
    }

    const theatreIds = [
      ...new Set((fallback.data ?? []).map((r) => r.theatre_id).filter(Boolean)),
    ];
    const patientIds = [
      ...new Set((fallback.data ?? []).map((r) => r.patient_id).filter(Boolean)),
    ];
    const surgeonIds = [
      ...new Set(
        (fallback.data ?? []).map((r) => r.lead_surgeon_id).filter(Boolean)
      ),
    ];

    const [theatres, patients, surgeons] = await Promise.all([
      theatreIds.length
        ? supabase.from("theatres").select("id, theatre_name").in("id", theatreIds)
        : Promise.resolve({ data: [] as { id: string; theatre_name: string }[] }),
      patientIds.length
        ? supabase.from("patients").select("id, full_name").in("id", patientIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      surgeonIds.length
        ? supabase.from("staff").select("id, full_name").in("id", surgeonIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);

    const theatreMap = new Map(
      (theatres.data ?? []).map((t) => [t.id, t.theatre_name])
    );
    const patientMap = new Map(
      (patients.data ?? []).map((p) => [p.id, p.full_name])
    );
    const surgeonMap = new Map(
      (surgeons.data ?? []).map((s) => [s.id, s.full_name])
    );

    return (fallback.data ?? []).map((row) => ({
      id: row.id,
      theatre: theatreMap.get(row.theatre_id) ?? "Unknown theatre",
      procedure: row.procedure_name,
      lead_surgeon: row.lead_surgeon_id
        ? (surgeonMap.get(row.lead_surgeon_id) ?? "Unassigned")
        : "Unassigned",
      patient_name: patientMap.get(row.patient_id) ?? "Unknown patient",
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
    }));
  }

  return (rows ?? []).map((row) => {
    const patient = firstRelation(
      row.patients as { full_name: string } | { full_name: string }[] | null
    );
    const theatre = firstRelation(
      row.theatres as { theatre_name: string } | { theatre_name: string }[] | null
    );
    const surgeon = firstRelation(
      row.lead_surgeon as { full_name: string } | { full_name: string }[] | null
    );

    return {
      id: row.id,
      theatre: theatre?.theatre_name ?? "Unknown theatre",
      procedure: row.procedure_name,
      lead_surgeon: surgeon?.full_name ?? "Unassigned",
      patient_name: patient?.full_name ?? "Unknown patient",
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
    };
  });
}

export async function getInventoryKpis(items: InventoryItem[]) {
  const totalItems = items.length;
  const lowStockAlerts = items.filter(
    (item) => item.current_stock < item.minimum_level
  ).length;
  const expiringSoon = items.filter((item) => {
    if (!item.expiry_date) return false;
    const expiry = new Date(item.expiry_date);
    const diffMs = expiry.getTime() - Date.now();
    return diffMs < 1000 * 60 * 60 * 24 * 30;
  }).length;
  const totalUnits = items.reduce((sum, item) => sum + item.current_stock, 0);

  return { totalItems, lowStockAlerts, expiringSoon, totalUnits };
}
