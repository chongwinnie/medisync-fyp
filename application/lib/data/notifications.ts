import { createClient } from "@/lib/supabase/server";

export interface NotificationRecord {
  id: string;
  type: "clinical" | "appointment" | "inventory" | "staff" | "system";
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  entity_type?: string;
  entity_id?: string;
}

export async function listNotifications(
  userId: string
): Promise<NotificationRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listNotifications:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    is_read: row.is_read,
    created_at: row.created_at,
    entity_type: row.entity_type ?? undefined,
    entity_id: row.entity_id ?? undefined,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("markNotificationRead:", error.message);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    console.error("markAllNotificationsRead:", error.message);
  }
}
