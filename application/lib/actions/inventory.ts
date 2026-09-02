"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

async function requireUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Unauthorized");
  return currentUser;
}

/** Keep inventory_alerts message/severity aligned with current stock (app-level fallback). */
async function syncInventoryAlertForItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, current_stock, minimum_level")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return;

  const currentStock = item.current_stock as number;
  const minimumLevel = item.minimum_level as number;

  if (currentStock > minimumLevel) {
    await supabase
      .from("inventory_alerts")
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("item_id", itemId)
      .eq("alert_type", "low_stock")
      .eq("is_dismissed", false);
    return;
  }

  const severity =
    currentStock <= Math.max(1, Math.floor(minimumLevel / 2))
      ? "critical"
      : "warning";
  const message = `Stock below minimum level (${currentStock}/${minimumLevel})`;

  const { data: existing } = await supabase
    .from("inventory_alerts")
    .select("id")
    .eq("item_id", itemId)
    .eq("alert_type", "low_stock")
    .eq("is_dismissed", false)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("inventory_alerts")
      .update({
        severity,
        message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("inventory_alerts").insert({
      item_id: itemId,
      alert_type: "low_stock",
      severity,
      message,
      is_dismissed: false,
    });
  }
}

export async function adjustStockAction(input: {
  itemId: string;
  adjustment: number;
  note?: string;
}): Promise<{ success: boolean; error?: string; newStock?: number }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") {
    return { success: false, error: "Only admins can adjust stock" };
  }

  if (!Number.isFinite(input.adjustment) || input.adjustment === 0) {
    return { success: false, error: "Adjustment must be a non-zero number" };
  }

  const supabase = await createClient();
  const { data: item, error: fetchError } = await supabase
    .from("inventory_items")
    .select("id, current_stock")
    .eq("id", input.itemId)
    .maybeSingle();

  if (fetchError || !item) {
    return { success: false, error: fetchError?.message ?? "Item not found" };
  }

  const newStock = Math.max(0, (item.current_stock as number) + input.adjustment);
  const { error } = await supabase
    .from("inventory_items")
    .update({
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Alert sync is also enforced by trg_sync_inventory_alert_on_stock when migration applied.
  await syncInventoryAlertForItem(supabase, input.itemId);

  revalidatePath("/inventory");
  return { success: true, newStock };
}

export async function addInventoryItemAction(input: {
  sku: string;
  itemName: string;
  category: string;
  currentStock: number;
  minimumLevel: number;
  reorderQuantity: number;
  unit: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") {
    return { success: false, error: "Only admins can add inventory items" };
  }

  const categoryMap: Record<string, string> = {
    Medicine: "medicine",
    medicine: "medicine",
    Supply: "supply",
    supply: "supply",
    Equipment: "equipment",
    equipment: "equipment",
    Consumable: "consumable",
    consumable: "consumable",
    Other: "other",
    other: "other",
  };
  const category = categoryMap[input.category] ?? "other";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      sku: input.sku,
      item_name: input.itemName,
      category,
      current_stock: Math.max(0, input.currentStock),
      minimum_level: Math.max(0, input.minimumLevel),
      reorder_quantity: Math.max(0, input.reorderQuantity),
      unit: input.unit || "units",
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/inventory");
  return { success: true, id: data.id };
}

export async function reorderStockAction(input: {
  itemId: string;
}): Promise<{ success: boolean; error?: string; newStock?: number }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") {
    return { success: false, error: "Only admins can reorder stock" };
  }

  const supabase = await createClient();
  const { data: item, error: fetchError } = await supabase
    .from("inventory_items")
    .select("id, current_stock, reorder_quantity")
    .eq("id", input.itemId)
    .maybeSingle();

  if (fetchError || !item) {
    return { success: false, error: fetchError?.message ?? "Item not found" };
  }

  const qty = Math.max(1, (item.reorder_quantity as number) || 1);
  const newStock = (item.current_stock as number) + qty;
  const { error } = await supabase
    .from("inventory_items")
    .update({
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId);

  if (error) {
    return { success: false, error: error.message };
  }

  await syncInventoryAlertForItem(supabase, input.itemId);

  revalidatePath("/inventory");
  return { success: true, newStock };
}

export async function dismissInventoryAlertAction(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") {
    return { success: false, error: "Only admins can dismiss alerts" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_alerts")
    .update({ is_dismissed: true })
    .eq("id", alertId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/inventory");
  return { success: true };
}

export async function allocateBedAction(input: {
  patientId: string;
  roomId: string;
  bedNumber: number;
  admissionDate?: string;
  specialRequirements?: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin" && currentUser.role !== "nurse") {
    return { success: false, error: "Only nurses and admins can allocate beds" };
  }

  if (!input.patientId || !input.roomId || !input.bedNumber || input.bedNumber < 1) {
    return { success: false, error: "Patient, room, and bed number are required" };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const admissionDate =
    input.admissionDate || new Date().toISOString().slice(0, 10);

  // Clear any prior active bed for this patient
  await supabase
    .from("bed_allocations")
    .update({ is_active: false, updated_at: now })
    .eq("patient_id", input.patientId)
    .eq("is_active", true);

  const { error: allocError } = await supabase.from("bed_allocations").insert({
    room_id: input.roomId,
    patient_id: input.patientId,
    allocated_by: currentUser.staffId,
    bed_number: input.bedNumber,
    admission_date: admissionDate,
    special_requirements: input.specialRequirements || null,
    is_active: true,
  });

  if (allocError) {
    return { success: false, error: allocError.message };
  }

  await supabase
    .from("patients")
    .update({
      status: "admitted",
      admitted_at: now,
      updated_at: now,
    })
    .eq("id", input.patientId);

  await supabase
    .from("rooms")
    .update({ status: "occupied", updated_at: now })
    .eq("id", input.roomId);

  revalidatePath("/inventory");
  revalidatePath(`/patients/${input.patientId}`);
  revalidatePath("/patients");
  return { success: true };
}
