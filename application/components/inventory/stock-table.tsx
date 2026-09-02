"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adjustStockAction,
  addInventoryItemAction,
} from "@/lib/actions/inventory";
import { toast } from "sonner";

export interface InventoryItem {
  id: string;
  sku: string;
  item_name: string;
  category: string;
  current_stock: number;
  minimum_level: number;
  reorder_quantity: number;
  unit: string;
  status: "active" | "inactive" | "expired";
  expiry_date?: string;
}

interface StockTableProps {
  items: InventoryItem[];
  isAdmin: boolean;
}

function StockLevelIndicator({
  current,
  minimum,
}: {
  current: number;
  minimum: number;
}) {
  if (current === 0) {
    return <span style={{ color: "#E24B4A", fontWeight: 600 }}>{current}</span>;
  }
  if (current < minimum) {
    return <span style={{ color: "#E24B4A", fontWeight: 600 }}>{current}</span>;
  }
  if (current <= minimum * 1.2) {
    return (
      <span style={{ color: "#BA7517", fontWeight: 600 }}>{current}</span>
    );
  }
  return <span style={{ color: "#639922", fontWeight: 600 }}>{current}</span>;
}

function StatusBadge({ status }: { status: InventoryItem["status"] }) {
  if (status === "expired") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
        Expired
      </Badge>
    );
  }
  if (status === "inactive") {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100">
        Inactive
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
      Active
    </Badge>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    Medicine: "bg-blue-100 text-blue-700 border-blue-200",
    PPE: "bg-purple-100 text-purple-700 border-purple-200",
    Equipment: "bg-orange-100 text-orange-700 border-orange-200",
    Consumable: "bg-teal-100 text-teal-700 border-teal-200",
    Surgical: "bg-pink-100 text-pink-700 border-pink-200",
  };
  const cls =
    colorMap[category] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <Badge className={`${cls} hover:opacity-90`}>{category}</Badge>
  );
}

function AdjustStockModal({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [adjustment, setAdjustment] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    const delta = Number(adjustment);
    setSaving(true);
    setError(null);
    const result = await adjustStockAction({
      itemId: item.id,
      adjustment: delta,
      note: note || undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Failed to adjust stock");
      return;
    }
    onOpenChange(false);
    setAdjustment("");
    setNote("");

    const newStock = result.newStock ?? item.current_stock + delta;
    if (newStock <= item.minimum_level) {
      toast.warning(`Low Stock Alert: ${item.item_name}`, {
        description: `Current stock has fallen to ${newStock} ${item.unit} (Minimum threshold: ${item.minimum_level} ${item.unit}). Please initiate reorder.`,
        duration: 7000,
      });
    } else {
      toast.success(`Stock updated for ${item.item_name}`, {
        description: `New stock level: ${newStock} ${item.unit} (${delta > 0 ? "+" : ""}${delta} ${item.unit})`,
        duration: 4000,
      });
    }

    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {item.item_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="current-stock">Current Stock</Label>
            <Input
              id="current-stock"
              value={`${item.current_stock} ${item.unit}`}
              disabled
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adjustment">
              Adjustment (positive to add, negative to remove)
            </Label>
            <Input
              id="adjustment"
              type="number"
              placeholder="e.g. 50 or -10"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              placeholder="Reason for adjustment"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-[#E24B4A]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            style={{ backgroundColor: "#0062a1" }}
            onClick={() => void handleSave()}
            disabled={saving || !adjustment}
          >
            {saving ? "Saving…" : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddItemModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    sku: "",
    itemName: "",
    category: "Medicine",
    currentStock: "0",
    minimumLevel: "0",
    reorderQuantity: "0",
    unit: "units",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await addInventoryItemAction({
      sku: form.sku,
      itemName: form.itemName,
      category: form.category,
      currentStock: Number(form.currentStock) || 0,
      minimumLevel: Number(form.minimumLevel) || 0,
      reorderQuantity: Number(form.reorderQuantity) || 0,
      unit: form.unit,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Failed to add item");
      return;
    }
    onOpenChange(false);
    setForm({
      sku: "",
      itemName: "",
      category: "Medicine",
      currentStock: "0",
      minimumLevel: "0",
      reorderQuantity: "0",
      unit: "units",
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {(
            [
              ["sku", "SKU"],
              ["itemName", "Item name"],
              ["category", "Category"],
              ["currentStock", "Current stock"],
              ["minimumLevel", "Minimum level"],
              ["reorderQuantity", "Reorder quantity"],
              ["unit", "Unit"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`add-${key}`}>{label}</Label>
              <Input
                id={`add-${key}`}
                value={form[key]}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [key]: e.target.value }))
                }
              />
            </div>
          ))}
          {error && <p className="text-xs text-[#E24B4A]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            style={{ backgroundColor: "#0062a1" }}
            onClick={() => void handleSave()}
            disabled={saving || !form.sku || !form.itemName}
          >
            {saving ? "Saving…" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StockTable({ items, isAdmin }: StockTableProps) {
  const [adjustTarget, setAdjustTarget] =
    React.useState<InventoryItem | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = items.filter(
    (item) =>
      item.item_name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-xl bg-white ring-1 ring-black/10 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <Input
          placeholder="Search inventory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm">
                Filters
              </Button>
              <Button variant="outline" size="sm">
                Import CSV
              </Button>
              <Button
                size="sm"
                style={{ backgroundColor: "#0062a1", color: "#fff" }}
                onClick={() => setAddOpen(true)}
              >
                + Add item
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Item Name</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Min Level</th>
              <th className="px-4 py-3 text-left font-medium">Unit</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Expiry</th>
              {isAdmin && (
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {item.item_name}
                </td>
                <td className="px-4 py-3">
                  <CategoryBadge category={item.category} />
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                  {item.sku}
                </td>
                <td className="px-4 py-3 text-right">
                  <StockLevelIndicator
                    current={item.current_stock}
                    minimum={item.minimum_level}
                  />
                </td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {item.minimum_level}
                </td>
                <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td
                  className="px-4 py-3 text-sm"
                  style={
                    item.expiry_date &&
                    new Date(item.expiry_date) < new Date()
                      ? { color: "#E24B4A" }
                      : { color: "#6b7280" }
                  }
                >
                  {item.expiry_date ?? "—"}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setAdjustTarget(item)}
                    >
                      Adjust Stock
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
        <span>
          Showing {filtered.length} of {items.length} items
        </span>
      </div>

      {adjustTarget && (
        <AdjustStockModal
          item={adjustTarget}
          open={!!adjustTarget}
          onOpenChange={(v) => !v && setAdjustTarget(null)}
        />
      )}
      {isAdmin && (
        <AddItemModal open={addOpen} onOpenChange={setAddOpen} />
      )}
    </div>
  );
}
