"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

async function requireUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Unauthorized");
  return currentUser;
}

export async function approveTreatmentPlanAction(input: {
  planId: string;
  patientId: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "doctor") {
    return { success: false, error: "Only doctors can approve treatment plans" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("treatment_plans")
    .update({
      status: "active",
      reviewed_by: currentUser.staffId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.planId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Non-blocking trigger to auto-reindex patient clinical knowledge
  const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000";
  fetch(`${aiApiUrl}/knowledge/auto-reindex`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Role": "doctor",
    },
    body: JSON.stringify({ patient_id: input.patientId }),
  }).catch(() => {});

  revalidatePath(`/patients/${input.patientId}`);
  return { success: true };
}

export async function regenerateTreatmentPlanDraftAction(input: {
  planId: string;
  patientId: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "doctor") {
    return {
      success: false,
      error: "Only doctors can regenerate treatment plan drafts",
    };
  }

  const supabase = await createClient();
  const { data: plan, error: fetchError } = await supabase
    .from("treatment_plans")
    .select("id, title, objectives, ai_draft_content, patient_id")
    .eq("id", input.planId)
    .maybeSingle();

  if (fetchError || !plan) {
    return { success: false, error: fetchError?.message ?? "Plan not found" };
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, patient_code, status")
    .eq("id", input.patientId)
    .maybeSingle();

  const { data: conditions } = await supabase
    .from("patient_conditions")
    .select("condition_name, severity")
    .eq("patient_id", input.patientId)
    .eq("is_active", true)
    .limit(5);

  const stamp = new Date().toISOString();
  const revisionMatch = /\[rev\s+(\d+)\]/i.exec(plan.title ?? "");
  const nextRev = revisionMatch ? Number(revisionMatch[1]) + 1 : 1;
  const baseTitle = (plan.title ?? "Treatment plan").replace(
    /\s*\[rev\s+\d+\]\s*$/i,
    ""
  );
  const revisedTitle = `${baseTitle} [rev ${nextRev}]`;

  const conditionLines =
    conditions && conditions.length > 0
      ? conditions
          .map(
            (c) =>
              `- ${c.condition_name}${c.severity ? ` (${c.severity})` : ""}`
          )
          .join("\n")
      : "- (no active conditions on file)";

  const prior = (plan.ai_draft_content as string) || plan.objectives || "";
  const regenerated = [
    "DRAFT — AI-assisted. Requires clinician review and approval.",
    `Regenerated at ${stamp} (revision ${nextRev}).`,
    "",
    `Patient: ${patient?.full_name ?? "Unknown"} (${patient?.patient_code ?? "n/a"}), status: ${patient?.status ?? "n/a"}.`,
    "Active conditions considered:",
    conditionLines,
    "",
    "Revised goals:",
    "1. Stabilize acute issues and monitor vitals per ward protocol.",
    "2. Continue indicated medications; review interactions before changes.",
    "3. Schedule follow-up diagnostics / clinic review within 7 days.",
    "4. Patient education on warning signs and adherence.",
    "",
    prior
      ? `Prior draft retained for reference:\n${prior.slice(0, 2000)}`
      : `Seed draft for: ${revisedTitle}`,
  ].join("\n");

  const { error } = await supabase
    .from("treatment_plans")
    .update({
      title: revisedTitle,
      ai_draft_content: regenerated,
      ai_assisted: true,
      status: "draft",
      updated_at: stamp,
    })
    .eq("id", input.planId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/patients/${input.patientId}`);
  return { success: true };
}
