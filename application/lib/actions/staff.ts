"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { auth0 } from "@/lib/auth0";

export async function processPayrollAction(input: {
  payrollId: string;
}): Promise<{ success: boolean; error?: string; stripeStatus?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Unauthorized" };
  }
  if (currentUser.role !== "admin") {
    return { success: false, error: "Only admins can process payroll" };
  }

  const supabase = await createClient();
  const { data: row, error: fetchError } = await supabase
    .from("payroll_records")
    .select("id, status")
    .eq("id", input.payrollId)
    .maybeSingle();

  if (fetchError || !row) {
    return { success: false, error: fetchError?.message ?? "Payroll record not found" };
  }
  if (row.status !== "draft" && row.status !== "processed") {
    return {
      success: false,
      error: "Only draft or processed payroll records can be paid via Stripe",
    };
  }

  const aiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? process.env.AI_API_URL;
  if (!aiUrl) {
    return { success: false, error: "AI API URL not configured" };
  }

  let accessToken = "";
  try {
    const audience = process.env.AUTH0_AUDIENCE;
    const tokenResult = audience
      ? await auth0.getAccessToken({ audience })
      : await auth0.getAccessToken();
    accessToken = tokenResult.token;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? `Auth0 token error: ${error.message}`
          : "Could not get Auth0 access token for payroll API",
    };
  }

  try {
    const response = await fetch(`${aiUrl}/payroll/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        payroll_id: input.payrollId,
        processed_by_staff_id: currentUser.staffId ?? null,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
      reason?: string;
      stripe_payment_intent_id?: string;
    };

    if (!response.ok || payload.status === "error" || payload.status === "denied") {
      // Fallback: mark processed locally if Stripe is not configured (demo continuity)
      if (response.status === 503 || payload.status === "skipped") {
        const { error } = await supabase
          .from("payroll_records")
          .update({
            status: "processed",
            processed_by: currentUser.staffId,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.payrollId);
        if (error) {
          return {
            success: false,
            error: `Stripe unavailable and local update failed: ${error.message}`,
            stripeStatus: "skipped",
          };
        }
        revalidatePath("/staff");
        return {
          success: true,
          stripeStatus: "skipped",
          error:
            payload.reason ??
            payload.error ??
            "Stripe not configured — marked processed without payment",
        };
      }
      return {
        success: false,
        error: payload.error ?? payload.reason ?? `Payroll API ${response.status}`,
        stripeStatus: payload.status,
      };
    }

    revalidatePath("/staff");
    return {
      success: true,
      stripeStatus: payload.status ?? "paid",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payroll request failed",
    };
  }
}
