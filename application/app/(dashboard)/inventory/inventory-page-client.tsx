"use client";

import * as React from "react";
import { useRequireRole } from "@/hooks/use-require-role";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  StockTable,
  type InventoryItem,
} from "@/components/inventory/stock-table";
import {
  ActiveAlertsPanel,
  type Alert,
} from "@/components/inventory/active-alerts-panel";
import {
  BedAllocationGrid,
  type Room,
} from "@/components/inventory/bed-allocation-grid";
import { AllocateBedForm } from "@/components/inventory/allocate-bed-form";
import {
  TheatreBookingsTable,
  type TheatreBooking,
} from "@/components/inventory/theatre-bookings-table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InventoryPageClientProps {
  items: InventoryItem[];
  alerts: Alert[];
  rooms: Room[];
  bookings: TheatreBooking[];
  patientOptions: Array<{ id: string; name: string; patient_code: string }>;
  kpis: {
    totalItems: number;
    lowStockAlerts: number;
    expiringSoon: number;
    totalUnits: number;
  };
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
}

function KpiCard({ label, value, icon, accent = "#0062a1" }: KpiCardProps) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-black/10 p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <span
          className="flex items-center justify-center w-7 h-7 rounded-lg text-base"
          style={{ backgroundColor: `${accent}18`, color: accent }}
        >
          {icon}
        </span>
      </div>
      <span
        className="text-3xl font-bold mt-1"
        style={{ color: accent !== "#0062a1" ? accent : "#111827" }}
      >
        {value}
      </span>
    </div>
  );
}

export function InventoryPageClient({
  items,
  alerts,
  rooms,
  bookings,
  patientOptions,
  kpis,
}: InventoryPageClientProps) {
  const { role, isLoading, isAllowed } = useRequireRole(["nurse", "admin"]);
  const isAdmin = role === "admin";
  const [allocateOpen, setAllocateOpen] = React.useState(false);
  const alertedRef = React.useRef(false);

  React.useEffect(() => {
    if (alertedRef.current) return;
    const lowStockItems = items.filter(
      (item) => item.status === "active" && item.current_stock <= item.minimum_level
    );
    if (lowStockItems.length > 0) {
      alertedRef.current = true;
      const criticalCount = lowStockItems.filter((i) => i.current_stock === 0).length;
      const sampleNames = lowStockItems
        .slice(0, 3)
        .map((i) => `${i.item_name} (${i.current_stock}/${i.minimum_level} ${i.unit})`)
        .join(", ");
      const extra = lowStockItems.length > 3 ? ` and ${lowStockItems.length - 3} other items.` : ".";

      if (criticalCount > 0) {
        toast.error(`Critical Inventory: ${criticalCount} item(s) out of stock!`, {
          description: `Immediate reorder required for: ${sampleNames}${extra}`,
          duration: 8000,
        });
      } else {
        toast.warning(`Low Stock Alert: ${lowStockItems.length} item(s) below minimum threshold`, {
          description: `Items needing replenishment: ${sampleNames}${extra}`,
          duration: 6000,
        });
      }
    }
  }, [items]);

  const availableRooms = rooms
    .filter((room) => room.status === "available")
    .map((room) => ({
      id: room.id,
      room_number: room.room_number,
      ward: room.ward,
    }));

  if (isLoading || role === null) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return (
    <div>
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-1 h-7 rounded-full"
                  style={{ backgroundColor: "#0062a1" }}
                />
                <h1 className="text-2xl font-bold text-gray-900">
                  Inventory &amp; Resources
                </h1>
              </div>
              <p className="text-sm text-gray-500 ml-3">
                Manage hospital supplies, allocations, and facilities.
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="stock" className="gap-0">
          <TabsList
            variant="line"
            className="mb-6 border-b border-gray-200 w-full rounded-none bg-transparent pb-0 h-auto"
          >
            <TabsTrigger value="stock">Stock Inventory</TabsTrigger>
            <TabsTrigger value="beds">Bed &amp; Room Allocation</TabsTrigger>
            <TabsTrigger value="theatre">Theatre Booking</TabsTrigger>
            <TabsTrigger value="alerts" className="relative">
              Alerts
              {alerts.length > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1 min-w-4 h-4"
                  style={{ backgroundColor: "#E24B4A", color: "#fff" }}
                >
                  {alerts.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stock">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="Total Items Tracked"
                value={kpis.totalItems.toLocaleString()}
                icon="📦"
                accent="#0062a1"
              />
              <KpiCard
                label="Low Stock Alerts"
                value={kpis.lowStockAlerts}
                icon="⚠️"
                accent="#BA7517"
              />
              <KpiCard
                label="Expiring Soon"
                value={kpis.expiringSoon}
                icon="📅"
                accent="#E24B4A"
              />
              <KpiCard
                label="Total Units in Stock"
                value={kpis.totalUnits.toLocaleString()}
                icon="📊"
                accent="#639922"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <StockTable items={items} isAdmin={isAdmin} />
              </div>
              <div className="w-72 shrink-0 hidden xl:block">
                <ActiveAlertsPanel alerts={alerts} canWrite={isAdmin} />
              </div>
            </div>

            <div className="mt-4 xl:hidden">
              <ActiveAlertsPanel alerts={alerts} canWrite={isAdmin} />
            </div>
          </TabsContent>

          <TabsContent value="beds">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">
                Bed &amp; Room Allocation
              </h2>
              {(isAdmin || role === "nurse") && (
                <Button
                  style={{ backgroundColor: "#0062a1", color: "#fff" }}
                  size="sm"
                  onClick={() => setAllocateOpen(true)}
                >
                  + Allocate Bed
                </Button>
              )}
            </div>
            <BedAllocationGrid rooms={rooms} />
            <AllocateBedForm
              open={allocateOpen}
              onOpenChange={setAllocateOpen}
              availableRooms={availableRooms}
              patients={patientOptions}
            />
          </TabsContent>

          <TabsContent value="theatre">
            <TheatreBookingsTable bookings={bookings} />
          </TabsContent>

          <TabsContent value="alerts">
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                All Active Alerts
              </h2>
              <ActiveAlertsPanel alerts={alerts} canWrite={isAdmin} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
