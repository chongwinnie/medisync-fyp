import { listPatientOptions } from "@/lib/data/patients";
import {
  getInventoryKpis,
  listInventoryAlerts,
  listInventoryItems,
  listRoomsWithAllocations,
  listTheatreBookings,
} from "@/lib/data/inventory";
import { InventoryPageClient } from "./inventory-page-client";

export default async function InventoryPage() {
  const [items, alerts, rooms, bookings, patientOptions] = await Promise.all([
    listInventoryItems(),
    listInventoryAlerts(),
    listRoomsWithAllocations(),
    listTheatreBookings(),
    listPatientOptions(),
  ]);

  const kpis = await getInventoryKpis(items);

  return (
    <InventoryPageClient
      items={items}
      alerts={alerts}
      rooms={rooms}
      bookings={bookings}
      patientOptions={patientOptions}
      kpis={kpis}
    />
  );
}
