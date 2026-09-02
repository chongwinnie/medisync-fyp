"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

import { auth0 } from "@/lib/auth0";

export interface FindingItem {
  observation: string;
  location: string;
  severity: "Normal" | "Mild" | "Moderate" | "Severe" | "Critical" | string;
  confidence: "High" | "Medium" | "Low" | string;
}

export interface DifferentialItem {
  label: string;
  confidence: "High" | "Moderate" | "Low" | string;
  icd_code?: string;
  description?: string;
}

export interface AnalyzeResult {
  summary: string;
  impression: string;
  modality?: string;
  region?: string;
  findings?: FindingItem[];
  differentials: DifferentialItem[];
  recommendations?: string[];
  critical_alerts?: string[];
  extracted_hud_metadata?: string[];
  disclaimer?: string;
}

export async function analyzeDiagnosticImageAction(
  formData: FormData
): Promise<{ success: boolean; error?: string; result?: AnalyzeResult }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Unauthorized: Please log in first." };
  }

  const file = formData.get("image") as File | null;
  const clinicalContext = (formData.get("clinical_context") as string) ?? "";
  const modality = (formData.get("modality") as string) ?? "xray";

  if (!file) {
    return { success: false, error: "No image provided" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const aiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? "http://localhost:8000";

  let accessToken = "";
  try {
    const audience = process.env.AUTH0_AUDIENCE;
    const tokenResult = audience
      ? await auth0.getAccessToken({ audience })
      : await auth0.getAccessToken();
    accessToken = tokenResult.token;
  } catch {
    // If not using live Auth0 OAuth session (e.g. dev login mode), use role dev-token
    accessToken = `dev-token-${currentUser.role}`;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-User-Role": currentUser.role,
      "X-User-Id": currentUser.userId,
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${aiUrl}/diagnostics/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_base64: base64,
        modality,
        clinical_context: clinicalContext,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMsg = text;
      try {
        const parsed = JSON.parse(text);
        errorMsg = parsed.error || parsed.detail || text;
      } catch {
        // use raw text
      }
      return { success: false, error: errorMsg || "Analysis failed" };
    }

    const data = await response.json();
    return {
      success: true,
      result: {
        summary: data.summary ?? "",
        impression: data.impression ?? data.summary ?? "",
        modality: data.modality ?? modality,
        region: data.region ?? "Target Region",
        findings: data.findings ?? [],
        differentials: data.differentials ?? [],
        recommendations: data.recommendations ?? [],
        critical_alerts: data.critical_alerts ?? [],
        extracted_hud_metadata: data.extracted_hud_metadata ?? [],
        disclaimer: data.disclaimer ?? "AI-assisted analysis for clinician review only.",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Analysis request failed",
    };
  }
}

export async function createDiagnosticReportAction(input: {
  patientId: string;
  reportType: string;
  title: string;
  notes?: string;
  aiAssisted?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("diagnostic_reports").insert({
    patient_id: input.patientId,
    requested_by: currentUser.staffId,
    report_type: input.reportType,
    title: input.title,
    findings: input.notes ?? null,
    ai_assisted: input.aiAssisted ?? false,
    status: "pending_review",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/diagnostics");
  return { success: true };
}
