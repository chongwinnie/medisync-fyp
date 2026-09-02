"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function updateStaffProfileAction(input: {
  department: string;
  phone: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Unauthorized" };
  }
  if (currentUser.role !== "admin") {
    return { success: false, error: "Only admins can update profile settings" };
  }
  if (!currentUser.staffId) {
    return { success: false, error: "No staff profile linked to this account" };
  }

  const department = input.department.trim();
  const phone = input.phone.trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({
      department: department || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", currentUser.staffId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}
